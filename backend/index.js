require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const crypto = require("crypto");
const sharp = require("sharp");
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 60,
    fileSize: 50 * 1024 * 1024,
  },
});

const shareSessions = new Map();
const PORT = Number(process.env.PORT || 3000);
const CORS_ORIGINS = new Set(
  parseCsv(process.env.CORS_ORIGINS).concat([
    "http://127.0.0.1:5173",
    "http://localhost:1420",
    "http://localhost:5173",
  ]),
);
const SPACES_REGION = process.env.SPACES_REGION || "";
const SPACES_NAME = process.env.SPACES_NAME || "";
const SPACES_ENDPOINT = process.env.SPACES_ENDPOINT || "";
const SPACES_KEY = process.env.SPACES_KEY || "";
const SPACES_SECRET = process.env.SPACES_SECRET || "";
const SPACES_CDN_URL = trimTrailingSlash(process.env.SPACES_CDN_URL || "");
const SHARE_BASE_URL = trimTrailingSlash(process.env.SHARE_BASE_URL || process.env.PUBLIC_APP_URL || "");
const SPACES_UPLOAD_PREFIX = trimSlashes(process.env.SPACES_UPLOAD_PREFIX || "photo_event/uploads");
const AI_MASKING_URL = trimTrailingSlash(process.env.AI_MASKING_URL || "http://127.0.0.1:8000");
const SPACES_READY = Boolean(SPACES_REGION && SPACES_NAME && SPACES_ENDPOINT && SPACES_KEY && SPACES_SECRET);
const spacesClient = SPACES_READY
  ? new S3Client({
      region: SPACES_REGION,
      endpoint: SPACES_ENDPOINT,
      forcePathStyle: false,
      credentials: {
        accessKeyId: SPACES_KEY,
        secretAccessKey: SPACES_SECRET,
      },
    })
  : null;
const SUBJECT_LABELS = ["Alex", "Jordan", "Taylor", "Sam", "Morgan", "Riley", "Casey"];
const STOP_WORDS = new Set([
  "img",
  "image",
  "photo",
  "picture",
  "shot",
  "capture",
  "copy",
  "edit",
  "final",
  "export",
  "dsc",
  "jpeg",
  "jpg",
  "png",
  "heic",
  "webp",
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || CORS_ORIGINS.size === 0 || CORS_ORIGINS.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS origin not allowed: ${origin}`));
    },
  }),
);
app.use(express.json({ limit: "5mb" }));

app.get("/", (_req, res) => {
  res.json({
    name: "PhotoFlow AI backend",
    status: "running",
    storageMode: SPACES_READY ? "digitalocean-spaces" : "mock",
    compressionMode: "sharp",
    endpoints: ["/api/health", "/api/ai/health", "/api/ai/mask", "/api/photos/pipeline", "/api/shares/:token"],
  });
});

app.get("/api/health", async (_req, res) => {
  const aiMasking = await getAiMaskingStatus();

  res.json({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    storage: {
      mode: SPACES_READY ? "digitalocean-spaces" : "mock",
      configured: SPACES_READY,
      bucket: SPACES_NAME || null,
      cdnUrl: SPACES_CDN_URL || null,
    },
    compression: {
      engine: "sharp",
      formats: ["jpeg", "webp"],
    },
    aiMasking,
  });
});

app.get("/api/ai/health", async (_req, res) => {
  const status = await getAiMaskingStatus();
  const httpStatus = status.online ? 200 : 503;
  return res.status(httpStatus).json(status);
});

app.post("/api/ai/mask", upload.single("photo"), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "Upload one photo for masking." });
  }

  try {
    const payload = await requestAiMask(file);
    return res.json(payload);
  } catch (error) {
    console.error(error);
    return res.status(503).json({
      error: error instanceof Error ? error.message : "Python masking service is unavailable.",
      endpoint: AI_MASKING_URL || null,
    });
  }
});

app.post("/api/photos/pipeline", upload.array("photos", 60), async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) {
    return res.status(400).json({ error: "Upload at least one photo." });
  }

  const manifest = parseManifest(req.body.manifest);
  const albumPreferences = parseAlbumPreferences(req.body.albumPreferences);
  const suppliedFaceClusters = parseFaceClusters(req.body.visionClusters);
  const batchId = new Date().toISOString().replace(/[:.]/g, "-");
  const photos = await Promise.all(files.map((file, index) => buildPhotoRecord(file, manifest[index], index)));
  const uploads = SPACES_READY
    ? await Promise.all(photos.map((photo, index) => uploadToSpaces(photo, index, batchId)))
    : await Promise.all(photos.map((photo, index) => simulateUpload(photo, index)));
  const uploadsByPhotoId = new Map(uploads.map((uploadItem) => [uploadItem.photoId, uploadItem]));
  const faceClusters = buildFaceClusters(photos, suppliedFaceClusters, albumPreferences);
  const albumOutcome = buildAiAlbums(photos, faceClusters, albumPreferences);
  const albums = albumOutcome.albums;
  const summary = buildSummary(photos, uploads);
  const shareAlbum = selectShareAlbum(albums);
  const sharePhotoIds = new Set(shareAlbum?.photoIds ?? photos.map((photo) => photo.id));
  const sharePhotos = photos.filter((photo) => sharePhotoIds.has(photo.id));
  const share = shareAlbum ? buildShareBundle(req, sharePhotos, shareAlbum) : null;

  if (share) {
    shareSessions.set(share.token, {
      ...share,
      generatedAt: new Date().toISOString(),
      storageMode: SPACES_READY ? "digitalocean-spaces" : "mock",
      photos: sharePhotos.map((photo) => {
        const uploaded = uploadsByPhotoId.get(photo.id);
        return {
          id: photo.id,
          name: photo.name,
          aiTags: photo.aiTags,
          clusterLabel: photo.clusterLabel,
          url: uploaded?.url || null,
        };
      }),
    });
  }

  return res.json({
    generatedAt: new Date().toISOString(),
    storageMode: SPACES_READY ? "digitalocean-spaces" : "mock",
    warning: SPACES_READY ? null : "Cloud storage is not connected yet. Uploads are being previewed locally.",
    summary,
    photos: photos.map((photo) => {
      const uploaded = uploadsByPhotoId.get(photo.id);
      return {
        id: photo.id,
        name: photo.name,
        sizeBytes: photo.sizeBytes,
        compressedBytes: photo.compressedBytes,
        savedBytes: photo.savedBytes,
        savingsPercent: photo.savingsPercent,
        mimeType: photo.mimeType,
        originalMimeType: photo.originalMimeType,
        optimizedExtension: photo.extension,
        compressionMode: photo.compressionMode,
        width: photo.width,
        height: photo.height,
        aiTags: photo.aiTags,
        clusterId: photo.clusterId,
        clusterLabel: photo.clusterLabel,
        faceConfidence: photo.faceConfidence,
        uploadedAt: uploaded?.completedAt,
        url: uploaded?.url || null,
      };
    }),
    uploads,
    faceClusters,
    albums,
    albumDiagnostics: albumOutcome.diagnostics,
    share,
  });
});

app.get("/api/shares/:token", (req, res) => {
  const share = shareSessions.get(req.params.token);
  if (!share) {
    return res.status(404).json({ error: "Share link expired or missing." });
  }

  if (req.query.format === "json") {
    return res.json(share);
  }

  const directPhotos = share.photos.filter((photo) => photo.url);
  if (directPhotos.length === 1) {
    return res.redirect(302, directPhotos[0].url);
  }

  if (directPhotos.length > 1) {
    return res
      .status(200)
      .type("html")
      .send(renderShareGallery(share, directPhotos));
  }

  return res.json(share);
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }

  if (error?.message?.startsWith("CORS origin not allowed")) {
    return res.status(403).json({ error: error.message });
  }

  console.error(error);
  return res.status(500).json({ error: "Photo pipeline failed." });
});

app.listen(PORT, () => {
  console.log(
    `Server running on http://localhost:${PORT} (${SPACES_READY ? `Spaces bucket ${SPACES_NAME}` : "mock uploads"})`,
  );
});

function parseManifest(rawManifest) {
  if (!rawManifest || typeof rawManifest !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(rawManifest);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

async function buildPhotoRecord(file, manifestEntry, index) {
  const id =
    manifestEntry?.id ||
    crypto.createHash("sha1").update(`${file.originalname}-${file.size}-${index}`).digest("hex").slice(0, 12);
  const descriptor = crypto.createHash("sha1").update(file.buffer).digest("hex");
  const dominantToken = extractDominantToken(file.originalname);
  const clusterLabel = dominantToken || SUBJECT_LABELS[parseInt(descriptor.slice(0, 2), 16) % SUBJECT_LABELS.length];
  const clusterId = slugify(clusterLabel);
  const optimized = await optimizePhoto(file);
  const savedBytes = Math.max(0, file.size - optimized.buffer.length);
  const aiTags = buildAiTags(file.originalname, optimized.mimeType, savedBytes, dominantToken, optimized.compressionMode);
  const faceConfidence = Number((0.81 + ((parseInt(descriptor.slice(4, 6), 16) % 17) / 100)).toFixed(2));

  return {
    id,
    name: file.originalname,
    originalMimeType: file.mimetype || "application/octet-stream",
    mimeType: optimized.mimeType,
    extension: optimized.extension,
    sizeBytes: file.size,
    compressedBytes: optimized.buffer.length,
    savedBytes,
    savingsPercent: Number(((savedBytes / file.size) * 100).toFixed(1)),
    compressionMode: optimized.compressionMode,
    width: optimized.width,
    height: optimized.height,
    aiTags,
    clusterId,
    clusterLabel,
    faceConfidence,
    lastModified: manifestEntry?.lastModified || null,
    qualityScore: optimized.quality.score,
    qualityIssues: optimized.quality.issues,
    isBlurry: optimized.quality.isBlurry,
    isLikelyCropped: optimized.quality.isLikelyCropped,
    descriptor,
    uploadBuffer: optimized.buffer,
  };
}

async function optimizePhoto(file) {
  const originalMimeType = file.mimetype || "application/octet-stream";
  const originalExtension = inferExtension(file.originalname, originalMimeType);

  if (!originalMimeType.startsWith("image/")) {
    return {
      buffer: file.buffer,
      mimeType: originalMimeType,
      extension: originalExtension,
      compressionMode: "original",
      width: null,
      height: null,
      quality: createFallbackQualityAssessment(),
    };
  }

  try {
    const image = sharp(file.buffer, { failOn: "none", animated: false }).rotate();
    const metadata = await image.metadata();
    const stats = await image.stats();
    const hasAlpha = Boolean(metadata.hasAlpha);
    const originalFormat = String(metadata.format || "").toLowerCase();
    const useWebp = hasAlpha || ["png", "webp", "gif", "svg"].includes(originalFormat);
    const quality = assessPhotoQuality(file.originalname, metadata, stats);

    const optimizedBuffer = useWebp
      ? await image
          .clone()
          .webp({
            quality: hasAlpha ? 84 : 80,
            effort: 4,
            smartSubsample: true,
            nearLossless: hasAlpha,
          })
          .toBuffer()
      : await image
          .clone()
          .jpeg({
            quality: 82,
            mozjpeg: true,
            chromaSubsampling: "4:2:0",
          })
          .toBuffer();

    if (optimizedBuffer.length >= file.buffer.length * 0.98) {
      return {
        buffer: file.buffer,
        mimeType: originalMimeType,
        extension: originalExtension,
        compressionMode: "original",
        width: metadata.width || null,
        height: metadata.height || null,
        quality,
      };
    }

    return {
      buffer: optimizedBuffer,
      mimeType: useWebp ? "image/webp" : "image/jpeg",
      extension: useWebp ? ".webp" : ".jpg",
      compressionMode: useWebp ? "webp" : "jpeg",
      width: metadata.width || null,
      height: metadata.height || null,
      quality,
    };
  } catch (error) {
    console.warn(`Compression fallback for ${file.originalname}: ${error.message}`);
    return {
      buffer: file.buffer,
      mimeType: originalMimeType,
      extension: originalExtension,
      compressionMode: "original",
      width: null,
      height: null,
      quality: createFallbackQualityAssessment(file.originalname),
    };
  }
}

async function uploadToSpaces(photo, index, batchId) {
  const key = buildObjectKey(batchId, index, photo.name, photo.extension);
  const startedAt = new Date().toISOString();
  const start = Date.now();

  const uploader = new Upload({
    client: spacesClient,
    params: {
      Bucket: SPACES_NAME,
      Key: key,
      Body: photo.uploadBuffer,
      ContentType: photo.mimeType,
      ACL: "public-read",
      CacheControl: "public, max-age=31536000, immutable",
      Metadata: {
        "original-name": encodeMetadata(photo.name),
        "cluster-label": encodeMetadata(photo.clusterLabel),
        "compression-mode": photo.compressionMode,
        "original-bytes": String(photo.sizeBytes),
        "uploaded-bytes": String(photo.compressedBytes),
      },
    },
  });

  await uploader.done();

  const durationMs = Math.max(1, Date.now() - start);
  const completedAt = new Date().toISOString();

  return {
    photoId: photo.id,
    endpoint: new URL(SPACES_ENDPOINT).host,
    bucket: SPACES_NAME,
    key,
    url: buildPublicUrl(key),
    startedAt,
    completedAt,
    durationMs,
    throughputMbps: Number((((photo.compressedBytes * 8) / 1_000_000) / (durationMs / 1000)).toFixed(2)),
    status: "uploaded",
  };
}

async function simulateUpload(photo, index) {
  const durationMs = 220 + Math.round(photo.compressedBytes / 12000) + (index % 4) * 75;
  const startedAt = new Date(Date.now() + index * 17).toISOString();

  await new Promise((resolve) => {
    setTimeout(resolve, Math.min(durationMs, 900));
  });

  return {
    photoId: photo.id,
    endpoint: `edge-${(index % 3) + 1}.photoflow.local`,
    bucket: null,
    key: null,
    url: null,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs,
    throughputMbps: Number((((photo.compressedBytes * 8) / 1_000_000) / (durationMs / 1000)).toFixed(2)),
    status: "uploaded",
  };
}

function buildFaceClusters(photos, suppliedClusters = [], albumPreferences = defaultAlbumPreferences()) {
  const photoIds = new Set(photos.map((photo) => photo.id));

  if (suppliedClusters.length) {
    const normalizedClusters = suppliedClusters
      .map((cluster, index) => {
        const clusterPhotoIds = Array.from(
          new Set(Array.isArray(cluster.photoIds) ? cluster.photoIds.filter((photoId) => photoIds.has(photoId)) : []),
        );

        if (!clusterPhotoIds.length) {
          return null;
        }

        const label =
          cluster.id === albumPreferences.primaryClusterId && albumPreferences.mainPersonName
            ? albumPreferences.mainPersonName
            : String(cluster.label || `Person ${index + 1}`).trim();

        return {
          id: String(cluster.id || `vision-${index + 1}`),
          label,
          confidence: Number(clampNumber(Number(cluster.confidence) || 0.82, 0.5, 0.99).toFixed(2)),
          photoIds: clusterPhotoIds,
          count: clusterPhotoIds.length,
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.count - left.count);

    if (normalizedClusters.length) {
      return normalizedClusters.slice(0, 6);
    }
  }

  const clusters = new Map();

  for (const photo of photos) {
    if (!clusters.has(photo.clusterId)) {
      clusters.set(photo.clusterId, {
        id: photo.clusterId,
        label: photo.clusterLabel,
        confidence: photo.faceConfidence,
        photoIds: [],
      });
    }

    const cluster = clusters.get(photo.clusterId);
    cluster.photoIds.push(photo.id);
    cluster.confidence = Number(((cluster.confidence + photo.faceConfidence) / 2).toFixed(2));
  }

  return Array.from(clusters.values())
    .map((cluster) => ({
      ...cluster,
      count: cluster.photoIds.length,
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 4);
}

function buildAiAlbums(photos, faceClusters, albumPreferences = defaultAlbumPreferences()) {
  const albums = [];
  const protectedPhotoIds = new Set(albumPreferences.referencePhotoId ? [albumPreferences.referencePhotoId] : []);
  const eligiblePhotos = photos.filter((photo) => isAlbumEligible(photo, albumPreferences, protectedPhotoIds));
  const qualityPool = eligiblePhotos.length ? eligiblePhotos : photos.filter((photo) => protectedPhotoIds.has(photo.id));
  const matchedPhotoIds = new Set(
    Array.isArray(albumPreferences.matchedPhotoIds) ? albumPreferences.matchedPhotoIds.filter(Boolean) : [],
  );
  const focusCluster = albumPreferences.primaryClusterId
    ? faceClusters.find((cluster) => cluster.id === albumPreferences.primaryClusterId)
    : null;
  const focusPhotoIds = matchedPhotoIds.size ? matchedPhotoIds : new Set(focusCluster?.photoIds ?? []);
  const groupMatchedPhotos = photos.filter((photo) => focusPhotoIds.has(photo.id));
  const focusPhotos = qualityPool.filter((photo) => focusPhotoIds.has(photo.id));
  const requirePersonFilter = albumPreferences.requireMainPerson && albumPreferences.mainPersonName;
  const albumPool = requirePersonFilter ? focusPhotos : qualityPool;
  const filterSummary = buildAlbumFilterSummary(photos.length - qualityPool.length, albumPreferences, focusPhotos.length);
  const blurryRemovedCount = albumPreferences.excludeBlurry
    ? groupMatchedPhotos.filter((photo) => shouldExcludeForBlur(photo, albumPreferences, protectedPhotoIds)).length
    : 0;
  const croppedRemovedCount = albumPreferences.excludeCropped
    ? groupMatchedPhotos.filter((photo) => shouldExcludeForCrop(photo, albumPreferences, protectedPhotoIds)).length
    : 0;
  const rejectedPhotos = groupMatchedPhotos
    .map((photo) => {
      const reasons = [];
      if (shouldExcludeForBlur(photo, albumPreferences, protectedPhotoIds)) {
        reasons.push("blur");
      }
      if (shouldExcludeForCrop(photo, albumPreferences, protectedPhotoIds)) {
        reasons.push("crop");
      }

      if (!reasons.length) {
        return null;
      }

      return {
        photoId: photo.id,
        name: photo.name,
        reasons,
      };
    })
    .filter(Boolean);
  const qualityFilteredCount = groupMatchedPhotos.filter(
    (photo) => !isAlbumEligible(photo, albumPreferences, protectedPhotoIds),
  ).length;
  const removedNotMatchingMainPersonCount = requirePersonFilter ? Math.max(0, qualityPool.length - focusPhotos.length) : 0;

  if (requirePersonFilter && !focusPhotos.length) {
    return {
      albums: [],
      diagnostics: buildAlbumDiagnostics({
        totalPhotos: photos.length,
        qualityFilteredCount,
        blurryRemovedCount,
        croppedRemovedCount,
        selectedGroupPhotoCount: groupMatchedPhotos.length,
        matchedMainPersonCount: focusPhotos.length,
        removedNotMatchingMainPersonCount,
        albumPoolCount: 0,
        albumsCreated: 0,
        albumPreferences,
        rejectedPhotos,
        noAlbumReason:
          groupMatchedPhotos.length === 0
            ? "The selected reference photo did not match any photos in this batch."
            : "Photos matched the selected reference photo, but all of them were removed by the current filters.",
      }),
    };
  }

  if (focusPhotos.length) {
    albums.push({
      id: "event-highlights",
      title: albumPreferences.eventName ? `${albumPreferences.eventName} Highlights` : "Event Highlights",
      description: `Best photos where ${albumPreferences.mainPersonName} is present.`,
      reason: filterSummary,
      photoIds: rankAlbumPhotos(focusPhotos, { preferFaceConfidence: true }).slice(0, 6).map((photo) => photo.id),
    });

    albums.push({
      id: "main-person",
      title: `${albumPreferences.mainPersonName} Moments`,
      description: `Recent photos that include ${albumPreferences.mainPersonName}.`,
      reason: filterSummary,
      photoIds: [...focusPhotos]
        .sort((left, right) => (right.lastModified || 0) - (left.lastModified || 0) || right.qualityScore - left.qualityScore)
        .slice(0, 6)
        .map((photo) => photo.id),
    });
  }

  albums.push({
    id: "best-shots",
    title: albumPreferences.eventName ? `${albumPreferences.eventName} Best Shots` : "Best Shots",
    description: "Clear, share-ready photos from this batch.",
    reason: filterSummary,
    photoIds: rankAlbumPhotos(albumPool).slice(0, 6).map((photo) => photo.id),
  });

  albums.push({
    id: "recent-moments",
    title: "Recent Moments",
    description: "Newest good photos from this batch.",
    reason: filterSummary,
    photoIds: [...albumPool]
      .sort((left, right) => (right.lastModified || 0) - (left.lastModified || 0) || right.qualityScore - left.qualityScore)
      .slice(0, 6)
      .map((photo) => photo.id),
  });

  const finalAlbums = albums.filter((album) => album.photoIds.length);

  return {
    albums: finalAlbums,
    diagnostics: buildAlbumDiagnostics({
      totalPhotos: photos.length,
      qualityFilteredCount,
      blurryRemovedCount,
      croppedRemovedCount,
      selectedGroupPhotoCount: groupMatchedPhotos.length,
      matchedMainPersonCount: focusPhotos.length,
      removedNotMatchingMainPersonCount,
      albumPoolCount: albumPool.length,
      albumsCreated: finalAlbums.length,
      albumPreferences,
      rejectedPhotos,
      noAlbumReason: finalAlbums.length ? "" : "No photos remained after applying the current album rules.",
    }),
  };
}

function buildSummary(photos, uploads) {
  const originalBytes = photos.reduce((sum, photo) => sum + photo.sizeBytes, 0);
  const compressedBytes = photos.reduce((sum, photo) => sum + photo.compressedBytes, 0);
  const savedBytes = originalBytes - compressedBytes;
  const totalUploadMs = uploads.reduce((maxDuration, upload) => Math.max(maxDuration, upload.durationMs), 0);
  const averageUploadMs = uploads.length
    ? Math.round(uploads.reduce((sum, upload) => sum + upload.durationMs, 0) / uploads.length)
    : 0;
  const throughputMbps = totalUploadMs
    ? Number((((compressedBytes * 8) / 1_000_000) / (totalUploadMs / 1000)).toFixed(2))
    : 0;

  return {
    totalPhotos: photos.length,
    originalBytes,
    compressedBytes,
    savedBytes,
    savingsPercent: Number(((savedBytes / originalBytes) * 100).toFixed(1)),
    totalUploadMs,
    averageUploadMs,
    throughputMbps,
    parallelUploads: uploads.length,
  };
}

function buildShareBundle(req, photos, album = null) {
  const token = crypto.randomBytes(4).toString("hex").toUpperCase();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
  const baseUrl = SHARE_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const metadataUrl = `${baseUrl}/api/shares/${token}?format=json`;
  const directUrl = photos.length === 1 ? null : `${baseUrl}/api/shares/${token}`;

  return {
    token,
    expiresAt,
    photoCount: photos.length,
    albumId: album?.id || null,
    albumTitle: album?.title || null,
    qrValue: directUrl || metadataUrl.replace("?format=json", ""),
    link: directUrl || metadataUrl.replace("?format=json", ""),
    metadataUrl,
  };
}

function selectShareAlbum(albums) {
  return albums.find((album) => album.id === "event-highlights") || albums.find((album) => album.id === "main-person") || null;
}

function buildAiTags(fileName, mimeType, savedBytes, dominantToken, compressionMode) {
  const tags = [];

  if (dominantToken) {
    tags.push(dominantToken);
  }

  if (mimeType.startsWith("image/")) {
    tags.push("image");
  }

  if (savedBytes > 1_500_000) {
    tags.push("large-saver");
  }

  tags.push(compressionMode === "original" ? "original-kept" : `${compressionMode}-optimized`);

  if (tags.length < 4) {
    tags.push("share-ready");
  }

  return Array.from(new Set(tags)).slice(0, 4);
}

function extractDominantToken(fileName) {
  const normalized = fileName
    .replace(/\.[^.]+$/, "")
    .split(/[^a-zA-Z]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

  if (!normalized.length) {
    return "";
  }

  return normalized[0].charAt(0).toUpperCase() + normalized[0].slice(1);
}

function buildObjectKey(batchId, index, fileName, extension) {
  const safeBaseName = slugify(fileName.replace(/\.[^.]+$/, "")).slice(0, 64) || "photo";
  const digest = crypto.createHash("sha1").update(`${batchId}:${index}:${fileName}`).digest("hex").slice(0, 10);
  const basePrefix = SPACES_UPLOAD_PREFIX ? `${SPACES_UPLOAD_PREFIX}/` : "";

  return `${basePrefix}${batchId}/${String(index + 1).padStart(2, "0")}-${safeBaseName}-${digest}${extension}`;
}

function buildPublicUrl(key) {
  if (SPACES_CDN_URL) {
    return `${SPACES_CDN_URL}/${key}`;
  }

  return `${trimTrailingSlash(SPACES_ENDPOINT)}/${SPACES_NAME}/${key}`;
}

function encodeMetadata(value) {
  return Buffer.from(String(value), "utf8").toString("base64").slice(0, 512);
}

function parseAlbumPreferences(rawPreferences) {
  const defaults = defaultAlbumPreferences();

  if (!rawPreferences || typeof rawPreferences !== "string") {
    return defaults;
  }

  try {
    const parsed = JSON.parse(rawPreferences);
    return {
      eventName: String(parsed?.eventName || "").trim(),
      mainPersonName: String(parsed?.mainPersonName || "").trim(),
      primaryClusterId: String(parsed?.primaryClusterId || "").trim(),
      referencePhotoId: String(parsed?.referencePhotoId || "").trim(),
      matchedPhotoIds: Array.isArray(parsed?.matchedPhotoIds)
        ? parsed.matchedPhotoIds.map((photoId) => String(photoId || "").trim()).filter(Boolean)
        : [],
      excludeBlurry: parsed?.excludeBlurry !== false,
      excludeCropped: parsed?.excludeCropped !== false,
      requireMainPerson: parsed?.requireMainPerson !== false,
    };
  } catch (_error) {
    return defaults;
  }
}

function parseFaceClusters(rawClusters) {
  if (!rawClusters || typeof rawClusters !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(rawClusters);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function defaultAlbumPreferences() {
  return {
    eventName: "",
    mainPersonName: "",
    primaryClusterId: "",
    referencePhotoId: "",
    matchedPhotoIds: [],
    excludeBlurry: true,
    excludeCropped: true,
    requireMainPerson: true,
  };
}

function createFallbackQualityAssessment(fileName = "") {
  const hasCropToken = /(?:^|[_\-\s])(crop|cropped|cut|trim|zoom)(?:[_\-\s]|$)/i.test(fileName);

  return {
    score: hasCropToken ? 42 : 60,
    sharpness: 0,
    entropy: 0,
    isBlurry: false,
    isLikelyCropped: hasCropToken,
    issues: hasCropToken ? ["cropped"] : [],
  };
}

function assessPhotoQuality(fileName, metadata, stats) {
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const minDimension = Math.min(width || 0, height || 0);
  const aspectRatio = width && height ? width / height : 1;
  const sharpness = Number(stats.sharpness || 0);
  const entropy = Number(stats.entropy || 0);
  const hasBlurToken = /blur|blurry|motion/i.test(fileName);
  const hasCropToken = /(?:^|[_\-\s])(crop|cropped|cut|trim|zoom)(?:[_\-\s]|$)/i.test(fileName);
  const hasEditToken = /(?:^|[_\-\s])(copy|edit|export|final)(?:[_\-\s]|$)/i.test(fileName);
  const isVerySoft = sharpness > 0 && sharpness < 1.8;
  const isVeryFlat = entropy > 0 && entropy < 2.2;
  const isBlurry = hasBlurToken || isVerySoft || (isVerySoft && isVeryFlat);
  const isVerySmall = minDimension > 0 && minDimension < 320;
  const isExtremeAspectRatio = aspectRatio > 2.6 || aspectRatio < 0.42;
  const isLikelyCropped = hasCropToken || isVerySmall || isExtremeAspectRatio;
  const issues = [];

  if (isBlurry) {
    issues.push("blurry");
  }
  if (isLikelyCropped) {
    issues.push("cropped");
  }
  if (hasEditToken) {
    issues.push("edited");
  }

  let score = 70;
  score += clampNumber((sharpness - 3) * 4, -10, 12);
  score += clampNumber((entropy - 4.5) * 3, -10, 12);
  score += clampNumber((minDimension - 900) / 60, -12, 12);

  if (isBlurry) {
    score -= 28;
  }
  if (isLikelyCropped) {
    score -= 20;
  }
  if (hasEditToken) {
    score -= 6;
  }

  return {
    score: Math.round(clampNumber(score, 5, 99)),
    sharpness: Number(sharpness.toFixed(2)),
    entropy: Number(entropy.toFixed(2)),
    isBlurry,
    isLikelyCropped,
    issues,
  };
}

function shouldProtectPhoto(photo, protectedPhotoIds) {
  return protectedPhotoIds.has(photo.id);
}

function shouldExcludeForBlur(photo, albumPreferences, protectedPhotoIds = new Set()) {
  return albumPreferences.excludeBlurry && photo.isBlurry && !shouldProtectPhoto(photo, protectedPhotoIds);
}

function shouldExcludeForCrop(photo, albumPreferences, protectedPhotoIds = new Set()) {
  return albumPreferences.excludeCropped && photo.isLikelyCropped && !shouldProtectPhoto(photo, protectedPhotoIds);
}

function isAlbumEligible(photo, albumPreferences, protectedPhotoIds = new Set()) {
  if (shouldExcludeForBlur(photo, albumPreferences, protectedPhotoIds)) {
    return false;
  }

  if (shouldExcludeForCrop(photo, albumPreferences, protectedPhotoIds)) {
    return false;
  }

  return true;
}

function rankAlbumPhotos(photos, options = {}) {
  const preferFaceConfidence = Boolean(options.preferFaceConfidence);

  return [...photos].sort((left, right) => {
    const scoreDelta = scoreAlbumPhoto(right, preferFaceConfidence) - scoreAlbumPhoto(left, preferFaceConfidence);

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return (right.lastModified || 0) - (left.lastModified || 0);
  });
}

function scoreAlbumPhoto(photo, preferFaceConfidence) {
  let score = photo.qualityScore || 50;
  score += Math.min(photo.savingsPercent, 25) * 0.5;
  score += Math.min((photo.width || 0) / 240, 8);

  if (preferFaceConfidence) {
    score += (photo.faceConfidence || 0) * 35;
  } else {
    score += (photo.faceConfidence || 0) * 12;
  }

  return score;
}

function buildAlbumFilterSummary(filteredOutCount, albumPreferences, matchedMainPersonCount = 0) {
  const filters = [];

  if (albumPreferences.requireMainPerson && albumPreferences.mainPersonName) {
    filters.push(`${albumPreferences.mainPersonName} in ${matchedMainPersonCount} photo${matchedMainPersonCount === 1 ? "" : "s"}`);
  }

  if (albumPreferences.excludeBlurry) {
    filters.push("blurred photos removed");
  }

  if (albumPreferences.excludeCropped) {
    filters.push("cropped photos removed");
  }

  if (filteredOutCount > 0) {
    filters.unshift(`${filteredOutCount} filtered out`);
  }

  return filters.join(" • ") || "Built from the strongest photos in this batch.";
}

function buildAlbumDiagnostics({
  totalPhotos,
  qualityFilteredCount,
  blurryRemovedCount,
  croppedRemovedCount,
  selectedGroupPhotoCount,
  matchedMainPersonCount,
  removedNotMatchingMainPersonCount,
  albumPoolCount,
  albumsCreated,
  albumPreferences,
  rejectedPhotos = [],
  noAlbumReason,
}) {
  return {
    eventName: albumPreferences.eventName || null,
    mainPersonName: albumPreferences.mainPersonName || null,
    requireMainPerson: albumPreferences.requireMainPerson,
    excludeBlurry: albumPreferences.excludeBlurry,
    excludeCropped: albumPreferences.excludeCropped,
    totalPhotos,
    selectedGroupPhotoCount,
    matchedMainPersonCount,
    qualityFilteredCount,
    blurryRemovedCount,
    croppedRemovedCount,
    removedNotMatchingMainPersonCount,
    albumPoolCount,
    albumsCreated,
    rejectedPhotos,
    noAlbumReason: noAlbumReason || null,
  };
}

async function getAiMaskingStatus() {
  if (!AI_MASKING_URL) {
    return {
      configured: false,
      online: false,
      endpoint: null,
      engine: "python",
      note: "AI masking URL is not configured.",
    };
  }

  try {
    const response = await fetch(`${AI_MASKING_URL}/health`);
    const payload = await parseJson(response);

    if (!response.ok) {
      throw new Error(payload?.error || `Health probe failed with ${response.status}`);
    }

    return {
      configured: true,
      online: true,
      endpoint: AI_MASKING_URL,
      engine: payload?.engine || "python",
      note: payload?.note || null,
    };
  } catch (error) {
    return {
      configured: true,
      online: false,
      endpoint: AI_MASKING_URL,
      engine: "python",
      note: error instanceof Error ? error.message : "Masking service probe failed.",
    };
  }
}

async function requestAiMask(file) {
  if (!AI_MASKING_URL) {
    throw new Error("AI masking URL is not configured.");
  }

  const form = new FormData();
  form.append(
    "photo",
    new Blob([file.buffer], {
      type: file.mimetype || "application/octet-stream",
    }),
    file.originalname,
  );

  const response = await fetch(`${AI_MASKING_URL}/mask`, {
    method: "POST",
    body: form,
  });
  const payload = await parseJson(response);

  if (!response.ok) {
    throw new Error(payload?.error || "Python masking service failed.");
  }

  return payload;
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferExtension(fileName, mimeType) {
  const nameExtension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase() : "";
  if (nameExtension) {
    return nameExtension;
  }

  if (mimeType.includes("png")) {
    return ".png";
  }

  if (mimeType.includes("webp")) {
    return ".webp";
  }

  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    return ".jpg";
  }

  return "";
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function trimSlashes(value) {
  return value.replace(/^\/+|\/+$/g, "");
}

function renderShareGallery(share, photos) {
  const cards = photos
    .map(
      (photo) => `
        <a class="card" href="${escapeHtml(photo.url)}" target="_blank" rel="noreferrer">
          <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.name)}" />
          <span>${escapeHtml(photo.name)}</span>
        </a>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Photo Share ${escapeHtml(share.token)}</title>
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #101826;
        color: #f5efe3;
      }
      main {
        max-width: 1080px;
        margin: 0 auto;
        padding: 32px 20px 56px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 2rem;
      }
      p {
        color: rgba(245, 239, 227, 0.72);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
        margin-top: 24px;
      }
      .card {
        display: grid;
        gap: 12px;
        text-decoration: none;
        color: inherit;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 18px;
        overflow: hidden;
        padding-bottom: 14px;
      }
      .card img {
        width: 100%;
        height: 220px;
        object-fit: cover;
        display: block;
      }
      .card span {
        padding: 0 14px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Photo Share</h1>
      <p>${share.photoCount} photo${share.photoCount === 1 ? "" : "s"}${share.albumTitle ? ` from ${escapeHtml(share.albumTitle)}` : ""}. Tap any image to open the full photo.</p>
      <section class="grid">${cards}</section>
    </main>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
