import { useEffect, useState, type ChangeEvent } from "react";
import "./App.css";
import type { RecognizedFaceCluster, RecognizedFaceDetection } from "./lib/faceRecognition";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const FACE_MODEL_URL = import.meta.env.VITE_FACE_MODEL_URL ?? "https://justadudewhohacks.github.io/face-api.js/models";
const REFERENCE_MATCH_THRESHOLD = 0.52;

type SelectedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

type UploadResult = {
  photoId: string;
  endpoint: string;
  bucket: string | null;
  key: string | null;
  url: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  throughputMbps: number;
  status: string;
};

type PhotoResult = {
  id: string;
  name: string;
  sizeBytes: number;
  compressedBytes: number;
  savedBytes: number;
  savingsPercent: number;
  mimeType: string;
  originalMimeType: string;
  optimizedExtension: string;
  compressionMode: string;
  width: number | null;
  height: number | null;
  aiTags: string[];
  clusterId: string;
  clusterLabel: string;
  faceConfidence: number;
  uploadedAt?: string;
  url: string | null;
};

type FaceCluster = {
  id: string;
  label: string;
  confidence: number;
  photoIds: string[];
  count: number;
};

type Album = {
  id: string;
  title: string;
  description: string;
  reason: string;
  photoIds: string[];
};

type AlbumPreferences = {
  eventName: string;
  mainPersonName: string;
  primaryClusterId: string;
  referencePhotoId: string;
  matchedPhotoIds: string[];
  excludeBlurry: boolean;
  excludeCropped: boolean;
  requireMainPerson: boolean;
};

type AlbumDiagnostics = {
  eventName: string | null;
  mainPersonName: string | null;
  requireMainPerson: boolean;
  excludeBlurry: boolean;
  excludeCropped: boolean;
  totalPhotos: number;
  selectedGroupPhotoCount: number;
  matchedMainPersonCount: number;
  qualityFilteredCount: number;
  blurryRemovedCount: number;
  croppedRemovedCount: number;
  removedNotMatchingMainPersonCount: number;
  albumPoolCount: number;
  albumsCreated: number;
  rejectedPhotos: Array<{
    photoId: string;
    name: string;
    reasons: string[];
  }>;
  noAlbumReason: string | null;
};

type ShareBundle = {
  token: string;
  expiresAt: string;
  photoCount: number;
  albumId: string | null;
  albumTitle: string | null;
  qrValue: string;
  link: string;
};

type HealthResponse = {
  status: string;
  storage: {
    mode: string;
    configured: boolean;
    bucket: string | null;
    cdnUrl: string | null;
  };
  compression: {
    engine: string;
    formats: string[];
  };
  aiMasking: {
    configured: boolean;
    online: boolean;
    endpoint: string | null;
    engine: string;
    note: string | null;
  };
};

type PipelineResponse = {
  generatedAt: string;
  storageMode: string;
  warning: string | null;
  summary: {
    totalPhotos: number;
    originalBytes: number;
    compressedBytes: number;
    savedBytes: number;
    savingsPercent: number;
    totalUploadMs: number;
    averageUploadMs: number;
    throughputMbps: number;
    parallelUploads: number;
  };
  photos: PhotoResult[];
  uploads: UploadResult[];
  faceClusters: FaceCluster[];
  albums: Album[];
  albumDiagnostics: AlbumDiagnostics;
  share: ShareBundle | null;
};

type FaceAnalysisStatus = "idle" | "loading-models" | "analyzing" | "ready" | "unavailable";

function App() {
  const [workflowStep, setWorkflowStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedPhoto[]>([]);
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [result, setResult] = useState<PipelineResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState("");
  const [visionClusters, setVisionClusters] = useState<RecognizedFaceCluster[]>([]);
  const [visionDetections, setVisionDetections] = useState<RecognizedFaceDetection[]>([]);
  const [faceAnalysisStatus, setFaceAnalysisStatus] = useState<FaceAnalysisStatus>("idle");
  const [faceAnalysisMessage, setFaceAnalysisMessage] = useState("");
  const [faceModelsReady, setFaceModelsReady] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedReferencePhotoId, setSelectedReferencePhotoId] = useState("");
  const [eventName, setEventName] = useState("");
  const [mainPersonName, setMainPersonName] = useState("");
  const [selectedPrimaryClusterId, setSelectedPrimaryClusterId] = useState("");
  const [excludeBlurry, setExcludeBlurry] = useState(true);
  const [excludeCropped, setExcludeCropped] = useState(true);
  const [requireMainPerson, setRequireMainPerson] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function checkBackend() {
      try {
        const response = await fetch(`${API_BASE}/api/health`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Health check failed");
        }
        const payload = (await response.json()) as HealthResponse;
        setBackendStatus("online");
        setHealth(payload);
      } catch (_error) {
        setBackendStatus("offline");
        setHealth(null);
      }
    }

    void checkBackend();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function prepareFaceModels() {
      try {
        setFaceAnalysisStatus("loading-models");
        const { preloadFaceRecognitionModels } = await import("./lib/faceRecognition");
        await preloadFaceRecognitionModels(FACE_MODEL_URL);
        if (active) {
          setFaceModelsReady(true);
          setFaceAnalysisStatus("idle");
          setFaceAnalysisMessage("Face grouping is ready.");
        }
      } catch (_error) {
        if (active) {
          setFaceModelsReady(false);
          setFaceAnalysisStatus("unavailable");
          setFaceAnalysisMessage("Face grouping is limited right now, but photo processing still works.");
        }
      }
    }

    void prepareFaceModels();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const photo of selectedPhotos) {
        URL.revokeObjectURL(photo.previewUrl);
      }
    };
  }, [selectedPhotos]);

  useEffect(() => {
    let active = true;

    async function generateQrCode() {
      if (!result?.share?.link) {
        setQrImageUrl("");
        return;
      }

      try {
        const { toDataURL } = await import("qrcode");
        const dataUrl = await toDataURL(result.share.link, {
          width: 260,
          margin: 1,
          color: {
            dark: "#101826",
            light: "#fff7ea",
          },
        });

        if (active) {
          setQrImageUrl(dataUrl);
        }
      } catch (_error) {
        if (active) {
          setQrImageUrl("");
        }
      }
    }

    void generateQrCode();

    return () => {
      active = false;
    };
  }, [result?.share?.link]);

  useEffect(() => {
    if (result?.albums.length) {
      setSelectedAlbumId((current) => current ?? result.albums[0].id);
      return;
    }

    setSelectedAlbumId(null);
  }, [result]);

  function handleSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    for (const photo of selectedPhotos) {
      URL.revokeObjectURL(photo.previewUrl);
    }

    const nextSelection = files.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setSelectedPhotos(nextSelection);
    setResult(null);
    setVisionClusters([]);
    setVisionDetections([]);
    setSelectedAlbumId(null);
    setErrorMessage("");
    setCopied(false);
    setQrImageUrl("");
    setSelectedPrimaryClusterId("");
    setSelectedReferencePhotoId("");
    setWorkflowStep(1);

    if (faceAnalysisStatus === "ready") {
      setFaceAnalysisStatus("idle");
    }
  }

  async function runFaceRecognition(photosToAnalyze = selectedPhotos) {
    if (!photosToAnalyze.length || !faceModelsReady) {
      return [];
    }

    try {
      setFaceAnalysisStatus("analyzing");
      setFaceAnalysisMessage("Looking for people in your photos.");
      const { analyzePhotoFaces } = await import("./lib/faceRecognition");

      const analysis = await analyzePhotoFaces(
        photosToAnalyze.map((photo) => ({
          id: photo.id,
          imageUrl: photo.previewUrl,
        })),
        FACE_MODEL_URL,
      );
      const clusters = analysis.clusters;

      if (clusters.length) {
        setVisionClusters(clusters);
        setVisionDetections(analysis.detections);
        setFaceAnalysisStatus("ready");
        setFaceAnalysisMessage("Choose which detected group matches the main person for this event.");
        return clusters;
      }

      setVisionClusters([]);
      setVisionDetections([]);
      setFaceAnalysisStatus("ready");
      setFaceAnalysisMessage("No clear face groups were found in this batch.");
      return [];
    } catch (_error) {
      setVisionClusters([]);
      setVisionDetections([]);
      setFaceAnalysisStatus("unavailable");
      setFaceAnalysisMessage("Face grouping is unavailable right now.");
      return [];
    }
  }

  useEffect(() => {
    if (!selectedPhotos.length || !faceModelsReady) {
      return;
    }

    void runFaceRecognition(selectedPhotos);
  }, [selectedPhotos, faceModelsReady]);

  async function copyShareLink() {
    if (!result?.share?.link) {
      return;
    }

    try {
      await navigator.clipboard.writeText(result.share.link);
      setCopied(true);
    } catch (_error) {
      setCopied(false);
    }
  }

  const previewById = new Map(selectedPhotos.map((photo) => [photo.id, photo.previewUrl]));
  const processedById = new Map(result?.photos.map((photo) => [photo.id, photo]) ?? []);
  const estimatedBytes = selectedPhotos.reduce((sum, photo) => sum + photo.file.size, 0);
  const activeFaceClusters = visionClusters.length ? visionClusters : result?.faceClusters ?? [];
  const usingLocalVision = visionClusters.length > 0;
  const namedFaceClusters = activeFaceClusters.map((cluster, index) => ({
    ...cluster,
    displayLabel: resolveClusterLabel(cluster, index, result?.faceClusters ?? [], processedById),
  }));
  const selectedAlbum = result?.albums.find((album) => album.id === selectedAlbumId) ?? result?.albums[0] ?? null;
  const storageNotice = health?.aiMasking.online
    ? "Privacy masking is available."
    : "Privacy masking can be added when needed.";
  const matchedReferencePhotoIds = selectedReferencePhotoId
    ? matchDetectionsToReference(visionDetections, selectedReferencePhotoId)
    : [];
  const albumPreferences: AlbumPreferences = {
    eventName: eventName.trim(),
    mainPersonName: mainPersonName.trim(),
    primaryClusterId: selectedPrimaryClusterId,
    referencePhotoId: selectedReferencePhotoId,
    matchedPhotoIds: matchedReferencePhotoIds,
    excludeBlurry,
    excludeCropped,
    requireMainPerson,
  };
  const selectedClusterLabel =
    namedFaceClusters.find((cluster) => cluster.id === selectedPrimaryClusterId)?.displayLabel ?? "";
  const activeFaceClusterKey = namedFaceClusters.map((cluster) => cluster.id).join("|");
  const selectedGroup = namedFaceClusters.find((cluster) => cluster.id === selectedPrimaryClusterId) ?? null;
  const matchedPreviewPhotos = selectedReferencePhotoId
    ? selectedPhotos.filter((photo) => matchedReferencePhotoIds.includes(photo.id))
    : selectedGroup
      ? selectedPhotos.filter((photo) => selectedGroup.photoIds.includes(photo.id))
      : [];
  const unmatchedPreviewPhotos = selectedReferencePhotoId
    ? selectedPhotos.filter((photo) => !matchedReferencePhotoIds.includes(photo.id))
    : selectedGroup
      ? selectedPhotos.filter((photo) => !selectedGroup.photoIds.includes(photo.id))
      : selectedPhotos;
  const selectedReferencePhoto = selectedPhotos.find((photo) => photo.id === selectedReferencePhotoId) ?? null;
  const canContinueToReference = Boolean(selectedPhotos.length && albumPreferences.eventName && albumPreferences.mainPersonName);
  const canContinueToReview = Boolean(selectedReferencePhotoId && selectedPrimaryClusterId && matchedPreviewPhotos.length);

  useEffect(() => {
    if (!namedFaceClusters.length) {
      setSelectedPrimaryClusterId("");
      return;
    }

    setSelectedPrimaryClusterId((current) =>
      namedFaceClusters.some((cluster) => cluster.id === current) ? current : namedFaceClusters[0].id,
    );
  }, [activeFaceClusterKey]);

  useEffect(() => {
    if (!selectedReferencePhotoId) {
      return;
    }

    const matchedCluster = namedFaceClusters.find((cluster) => cluster.photoIds.includes(selectedReferencePhotoId));
    if (matchedCluster) {
      setSelectedPrimaryClusterId(matchedCluster.id);
      return;
    }

    setSelectedPrimaryClusterId("");
  }, [selectedReferencePhotoId, activeFaceClusterKey]);

  async function runPipeline() {
    if (!selectedPhotos.length) {
      setErrorMessage("Choose one or more photos first.");
      return;
    }

    if (!albumPreferences.eventName) {
      setErrorMessage("Add the event name before processing.");
      return;
    }

    if (!albumPreferences.mainPersonName) {
      setErrorMessage("Add the main person's name before processing.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage("");
    setCopied(false);

    try {
      const detectedClusters = visionClusters.length ? visionClusters : await runFaceRecognition(selectedPhotos);
      const preparedClusters = detectedClusters.map((cluster, index) => ({
        id: cluster.id,
        label:
          cluster.id === albumPreferences.primaryClusterId && albumPreferences.mainPersonName
            ? albumPreferences.mainPersonName
            : formatClusterName(cluster.label, index),
        confidence: cluster.confidence,
        photoIds: cluster.photoIds,
        count: cluster.count,
      }));

      const formData = new FormData();
      const manifest = selectedPhotos.map((photo) => ({
        id: photo.id,
        name: photo.file.name,
        size: photo.file.size,
        lastModified: photo.file.lastModified,
      }));

      for (const photo of selectedPhotos) {
        formData.append("photos", photo.file);
      }
      formData.append("manifest", JSON.stringify(manifest));
      formData.append("albumPreferences", JSON.stringify(albumPreferences));
      formData.append("visionClusters", JSON.stringify(preparedClusters));

      const response = await fetch(`${API_BASE}/api/photos/pipeline`, {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as PipelineResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Pipeline failed.");
      }

      const pipelineResult = payload as PipelineResponse;
      setResult(pipelineResult);
      setBackendStatus("online");
      setWorkflowStep(4);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Pipeline failed.");
      setBackendStatus("offline");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="panel workflow-shell">
        <div className="section-heading">
          <div>
            <p className="panel-label">PhotoFlow AI</p>
            <h1 className="workflow-title">Create Event Album</h1>
          </div>
          <span className="muted-text">A guided flow for event albums, matching, and sharing.</span>
        </div>

        <div className="status-row">
          <span className={`status-pill status-${backendStatus}`}>
            {backendStatus === "checking" ? "Getting ready" : backendStatus === "online" ? "Ready" : "Connection issue"}
          </span>
          <span className="status-pill neutral">{selectedPhotos.length} photos selected</span>
          <span className="status-pill neutral">{formatBytes(estimatedBytes)} total</span>
          <span className="status-pill neutral">Face groups {formatFaceStatus(faceAnalysisStatus)}</span>
          <span className={`status-pill ${health?.aiMasking.online ? "status-online" : "neutral"}`}>
            Privacy mask {health?.aiMasking.online ? "ready" : "optional"}
          </span>
        </div>

        <div className="workflow-nav">
          {[
            { step: 1, title: "Event" },
            { step: 2, title: "Reference" },
            { step: 3, title: "Review" },
            { step: 4, title: "Results" },
          ].map((item) => (
            <button
              key={item.step}
              type="button"
              className={`workflow-step ${workflowStep === item.step ? "workflow-step-active" : ""}`}
              onClick={() => {
                if (item.step === 1) {
                  setWorkflowStep(1);
                } else if (item.step === 2 && canContinueToReference) {
                  setWorkflowStep(2);
                } else if (item.step === 3 && canContinueToReview) {
                  setWorkflowStep(3);
                } else if (item.step === 4 && result) {
                  setWorkflowStep(4);
                }
              }}
            >
              <span>{item.step}</span>
              <strong>{item.title}</strong>
            </button>
          ))}
        </div>

        {result?.warning ? <p className="inline-error">{result.warning}</p> : null}
        {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}
        {faceAnalysisMessage ? <p className="footnote">{faceAnalysisMessage}</p> : null}
        <p className="footnote">{storageNotice}</p>
      </section>

      {workflowStep === 1 ? (
        <section className="panel workflow-stage">
          <div className="section-heading">
            <div>
              <p className="panel-label">Step 1</p>
              <h2>Create the event</h2>
            </div>
          </div>

          <div className="planner-grid">
            <label className="form-field">
              <span>Event name</span>
              <input
                className="field-input"
                type="text"
                value={eventName}
                onChange={(event) => {
                  setEventName(event.target.value);
                  setResult(null);
                }}
                placeholder="Aarav Birthday"
              />
            </label>

            <label className="form-field">
              <span>Main person</span>
              <input
                className="field-input"
                type="text"
                value={mainPersonName}
                onChange={(event) => {
                  setMainPersonName(event.target.value);
                  setResult(null);
                }}
                placeholder="Aarav"
              />
            </label>
          </div>

          <label className="upload-zone" htmlFor="photo-input">
            <span className="upload-title">Add event photos</span>
            <span className="upload-subtitle">Start by creating the event, then add the full photo batch.</span>
            <input id="photo-input" type="file" accept="image/*" multiple onChange={handleSelection} />
          </label>

          {selectedPhotos.length ? (
            <div className="photo-strip">
              {selectedPhotos.map((photo) => (
                <figure className="photo-card" key={photo.id}>
                  <img src={photo.previewUrl} alt={photo.file.name} />
                  <figcaption>
                    <strong>{photo.file.name}</strong>
                    <span>{formatBytes(photo.file.size)}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <div className="empty-state">Add photos to continue.</div>
          )}

          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              disabled={!canContinueToReference}
              onClick={() => setWorkflowStep(2)}
            >
              Next: Choose Main Person Photo
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                for (const photo of selectedPhotos) {
                  URL.revokeObjectURL(photo.previewUrl);
                }
                setSelectedPhotos([]);
                setSelectedReferencePhotoId("");
                setSelectedPrimaryClusterId("");
                setResult(null);
                setVisionClusters([]);
                setVisionDetections([]);
                setSelectedAlbumId(null);
                setFaceAnalysisStatus("idle");
                setFaceAnalysisMessage("");
                setErrorMessage("");
                setCopied(false);
                setQrImageUrl("");
                setWorkflowStep(1);
              }}
            >
              Clear Photos
            </button>
          </div>
        </section>
      ) : null}

      {workflowStep === 2 ? (
        <section className="panel workflow-stage">
          <div className="section-heading">
            <div>
              <p className="panel-label">Step 2</p>
              <h2>Choose one photo of {albumPreferences.mainPersonName || "the main person"}</h2>
            </div>
          </div>

          <p className="hero-text">
            Pick one of the uploaded photos that clearly shows the main person. PhotoFlow will use that selected photo as the reference.
          </p>

          <section className="planner-card">
            <div className="planner-heading">
              <strong>How to choose</strong>
              <span>Click any uploaded photo below that clearly shows the main person. The matching face group will be selected automatically.</span>
            </div>
            {selectedReferencePhoto ? (
              <div className="reference-summary">
                <img src={selectedReferencePhoto.previewUrl} alt={selectedReferencePhoto.file.name} />
                <div>
                  <strong>Selected reference photo</strong>
                  <p>{selectedReferencePhoto.file.name}</p>
                  <span>
                    {selectedClusterLabel
                      ? `Matched to ${selectedClusterLabel}`
                      : "Waiting for a detected face group"}
                  </span>
                </div>
              </div>
            ) : (
              <p className="footnote">No reference photo selected yet.</p>
            )}
          </section>

          <div className="photo-strip">
            {selectedPhotos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                className={`photo-card photo-card-button ${selectedReferencePhotoId === photo.id ? "photo-card-active" : ""}`}
                onClick={() => {
                  setSelectedReferencePhotoId(photo.id);
                  setResult(null);
                }}
              >
                <img src={photo.previewUrl} alt={photo.file.name} />
                <figcaption>
                  <strong>{photo.file.name}</strong>
                  <span>{formatBytes(photo.file.size)}</span>
                  <span>{selectedReferencePhotoId === photo.id ? "Selected as reference" : "Click to use as reference"}</span>
                </figcaption>
              </button>
            ))}
          </div>

          <section className="planner-card">
            <div className="planner-heading">
              <strong>Detected face groups</strong>
              <span>PhotoFlow does not know real names automatically. It only detects similar face groups.</span>
            </div>

            {namedFaceClusters.length ? (
              <div className="group-list">
                {namedFaceClusters.map((cluster, index) => (
                  <button
                    key={cluster.id}
                    type="button"
                    className={`group-card ${selectedPrimaryClusterId === cluster.id ? "group-card-active" : ""}`}
                    onClick={() => setSelectedPrimaryClusterId(cluster.id)}
                  >
                    <div className="group-card-header">
                      <strong>{formatDetectedGroupLabel(index)}</strong>
                      <span>{cluster.count} photos</span>
                    </div>
                    <div className="group-card-strip">
                      {cluster.photoIds.map((photoId) => (
                        <img key={photoId} src={previewById.get(photoId)} alt={formatDetectedGroupLabel(index)} />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">Face groups are still being detected from the selected photos.</div>
            )}

            <p className="footnote">
              {selectedReferencePhoto && selectedClusterLabel
                ? `Reference photo selected. ${selectedClusterLabel} is the detected group that contains this photo.`
                : selectedReferencePhoto
                  ? "Reference photo selected, but no matching face group was found for it yet."
                  : "Select a reference photo to continue."}
            </p>
          </section>

          <div className="action-row">
            <button className="secondary-button" type="button" onClick={() => setWorkflowStep(1)}>
              Back
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={!canContinueToReview}
              onClick={() => setWorkflowStep(3)}
            >
              Next: Review Matched Photos
            </button>
          </div>
        </section>
      ) : null}

      {workflowStep === 3 ? (
        <section className="panel workflow-stage">
          <div className="section-heading">
            <div>
              <p className="panel-label">Step 3</p>
              <h2>Review the photos that match {albumPreferences.mainPersonName || "the selected person"}</h2>
            </div>
          </div>

          <section className="planner-card">
            <div className="planner-heading">
              <strong>Photos that match the selected reference photo</strong>
              <span>These are the exact photos PhotoFlow will try to use for the album before applying blur and crop rules.</span>
            </div>

            {matchedPreviewPhotos.length ? (
              <div className="photo-strip">
                {matchedPreviewPhotos.map((photo) => (
                  <figure className="photo-card photo-card-match" key={photo.id}>
                    <img src={photo.previewUrl} alt={photo.file.name} />
                    <figcaption>
                      <strong>{photo.file.name}</strong>
                      <span>Matched to {albumPreferences.mainPersonName || selectedClusterLabel || "selected reference"}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <div className="empty-state">No photos currently match the selected reference photo.</div>
            )}
          </section>

          {unmatchedPreviewPhotos.length ? (
            <section className="planner-card">
              <div className="planner-heading">
                <strong>Photos outside this album match</strong>
                <span>These photos do not match the selected reference photo.</span>
              </div>
              <div className="photo-strip compact-photo-strip">
                {unmatchedPreviewPhotos.slice(0, 8).map((photo) => (
                  <figure className="photo-card" key={photo.id}>
                    <img src={photo.previewUrl} alt={photo.file.name} />
                    <figcaption>
                      <strong>{photo.file.name}</strong>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ) : null}

          <section className="planner-card">
            <div className="planner-heading">
              <strong>Album rules</strong>
              <span>Choose whether to remove blurry or cropped photos before the album is created.</span>
            </div>

            <div className="toggle-row">
              <label className="toggle-chip">
                <input
                  type="checkbox"
                  checked={excludeBlurry}
                  onChange={(event) => {
                    setExcludeBlurry(event.target.checked);
                    setResult(null);
                  }}
                />
                Skip blurry photos
              </label>
              <label className="toggle-chip">
                <input
                  type="checkbox"
                  checked={excludeCropped}
                  onChange={(event) => {
                    setExcludeCropped(event.target.checked);
                    setResult(null);
                  }}
                />
                Skip cropped photos
              </label>
              <label className="toggle-chip">
                <input
                  type="checkbox"
                  checked={requireMainPerson}
                  onChange={(event) => {
                    setRequireMainPerson(event.target.checked);
                    setResult(null);
                  }}
                />
                Only count photos with the main person
              </label>
            </div>
          </section>

          <div className="action-row">
            <button className="secondary-button" type="button" onClick={() => setWorkflowStep(2)}>
              Back
            </button>
            <button className="primary-button" type="button" onClick={runPipeline} disabled={isProcessing || !matchedPreviewPhotos.length}>
              {isProcessing ? "Creating album..." : "Create Album"}
            </button>
          </div>
        </section>
      ) : null}

      {workflowStep === 4 ? (
        <>
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="panel-label">Your Photos</p>
                <h2>Selected photos</h2>
              </div>
              <span className="muted-text">
                {result ? `${result.summary.totalPhotos} photos processed` : "Add photos to begin"}
              </span>
            </div>

            {selectedPhotos.length ? (
              <div className="photo-strip">
                {selectedPhotos.map((photo) => {
                  const processed = processedById.get(photo.id);

                  return (
                    <figure className="photo-card" key={photo.id}>
                      <img src={photo.previewUrl} alt={photo.file.name} />
                      <figcaption>
                        <strong>{photo.file.name}</strong>
                        <span>{formatBytes(photo.file.size)}</span>
                        {processed ? (
                          <span>
                            {processed.compressionMode.toUpperCase()} • {processed.savingsPercent}% saved
                          </span>
                        ) : null}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">No photos selected yet.</div>
            )}
          </section>

          <section className="dashboard-grid">
        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="panel-label">Processing</p>
              <h2>Results summary</h2>
            </div>
          </div>

          {result ? (
            <div className="metric-grid">
              <div className="metric-card">
                <span>Before</span>
                <strong>{formatBytes(result.summary.originalBytes)}</strong>
              </div>
              <div className="metric-card">
                <span>After</span>
                <strong>{formatBytes(result.summary.compressedBytes)}</strong>
              </div>
              <div className="metric-card">
                <span>Space saved</span>
                <strong>{formatBytes(result.summary.savedBytes)}</strong>
              </div>
              <div className="metric-card">
                <span>Upload time</span>
                <strong>{formatDuration(result.summary.totalUploadMs)}</strong>
              </div>
            </div>
          ) : (
            <div className="empty-state">Process photos to see your results.</div>
          )}
        </article>

        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="panel-label">People</p>
              <h2>Grouped photos</h2>
            </div>
          </div>

          {namedFaceClusters.length ? (
            <div className="stack">
              {namedFaceClusters.map((cluster) => (
                <div className="cluster-card" key={cluster.id}>
                  <div className="cluster-header">
                    <div>
                      <strong>{cluster.displayLabel}</strong>
                      <span>{cluster.count} photos together</span>
                    </div>
                    <span className="confidence-badge">{Math.round(cluster.confidence * 100)}% similar</span>
                  </div>
                  <div className="cluster-strip">
                    {cluster.photoIds.map((photoId) => (
                      <img key={photoId} src={previewById.get(photoId)} alt={cluster.displayLabel} />
                    ))}
                  </div>
                  <div className="cluster-meta">
                    {cluster.photoIds.map((photoId) => (
                      <span className="meta-pill" key={photoId}>
                        {processedById.get(photoId)?.name ?? photoId}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <p className="footnote">
                {usingLocalVision
                  ? "These groups are created automatically from similar faces in the selected photos."
                  : "Photo groups are shown with limited face matching right now."}
              </p>
            </div>
          ) : (
            <div className="empty-state">People groups will appear after processing.</div>
          )}
        </article>

        <article className="panel panel-wide">
          <div className="section-heading">
            <div>
              <p className="panel-label">Uploads</p>
              <h2>Photo upload progress</h2>
            </div>
          </div>

          {result?.uploads.length ? (
            <div className="stack">
              {result.uploads.map((upload) => {
                const photo = result.photos.find((item) => item.id === upload.photoId);
                const width = Math.max(
                  18,
                  Math.min(100, (upload.durationMs / Math.max(result.summary.averageUploadMs, 1) / 1.7) * 100),
                );

                return (
                  <div className="upload-row" key={upload.photoId}>
                    <div className="upload-copy">
                      <strong>{photo?.name ?? upload.photoId}</strong>
                      <span>{`Uploaded in ${formatDuration(upload.durationMs)}`}</span>
                      <span>{upload.status === "uploaded" ? "Upload complete" : upload.status}</span>
                    </div>
                    <div className="upload-bar-track">
                      <div className="upload-bar-fill" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">Upload progress will appear after processing.</div>
          )}
        </article>

        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="panel-label">Albums</p>
              <h2>Ready-made albums</h2>
            </div>
          </div>

          {result?.albums.length ? (
            <div className="stack">
              <div className="album-diagnostics">
                <strong>Why these albums were created</strong>
                <div className="album-diagnostics-grid">
                  <div>
                    <span>Photos matching reference</span>
                    <strong>{result.albumDiagnostics.selectedGroupPhotoCount}</strong>
                  </div>
                  <div>
                    <span>Photos kept after filters</span>
                    <strong>{result.albumDiagnostics.albumPoolCount}</strong>
                  </div>
                  <div>
                    <span>Removed for blur/crop</span>
                    <strong>
                      {result.albumDiagnostics.blurryRemovedCount + result.albumDiagnostics.croppedRemovedCount}
                    </strong>
                  </div>
                  <div>
                    <span>Removed for person mismatch</span>
                    <strong>{result.albumDiagnostics.removedNotMatchingMainPersonCount}</strong>
                  </div>
                </div>
              </div>
              {result.albums.map((album) => (
                <button
                  className={`album-card album-button ${selectedAlbum?.id === album.id ? "album-active" : ""}`}
                  key={album.id}
                  type="button"
                  onClick={() => setSelectedAlbumId(album.id)}
                >
                  <div className="album-cover">
                    {album.photoIds[0] ? <img src={previewById.get(album.photoIds[0])} alt={album.title} /> : null}
                  </div>
                  <div className="album-copy">
                    <strong>{album.title}</strong>
                    <p>{album.description}</p>
                    <span>{album.photoIds.length} photos in this group</span>
                  </div>
                </button>
              ))}
              {selectedAlbum ? (
                <div className="album-detail">
                  <div className="album-detail-header">
                    <div>
                      <strong>{selectedAlbum.title}</strong>
                      <p>{selectedAlbum.description}</p>
                      <p className="album-detail-note">{selectedAlbum.reason}</p>
                    </div>
                    <span className="confidence-badge">{selectedAlbum.photoIds.length} photos</span>
                  </div>
                  <div className="album-gallery">
                    {selectedAlbum.photoIds.map((photoId) => {
                      const photo = processedById.get(photoId);
                      const previewUrl = previewById.get(photoId);
                      return (
                        <article className="album-gallery-card" key={photoId}>
                          {previewUrl ? <img src={previewUrl} alt={photo?.name ?? photoId} /> : null}
                          <div className="album-gallery-copy">
                            <strong>{photo?.name ?? photoId}</strong>
                            <span>
                              {photo
                                ? `${formatBytes(photo.compressedBytes)}${photo.savingsPercent > 0 ? ` • ${photo.savingsPercent}% smaller` : ""}`
                                : "Selected photo"}
                            </span>
                            {photo?.url ? (
                              <a className="text-link" href={photo.url} target="_blank" rel="noreferrer">
                                Open photo
                              </a>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            result ? (
              <div className="album-diagnostics empty-state empty-state-left">
                <strong>No album was created</strong>
                <p>{result.albumDiagnostics.noAlbumReason ?? "No photos matched the current album rules."}</p>
                <div className="album-diagnostics-grid">
                  <div>
                    <span>Total photos</span>
                    <strong>{result.albumDiagnostics.totalPhotos}</strong>
                  </div>
                  <div>
                    <span>Matched reference photo</span>
                    <strong>{result.albumDiagnostics.selectedGroupPhotoCount}</strong>
                  </div>
                  <div>
                    <span>Removed for blur</span>
                    <strong>{result.albumDiagnostics.blurryRemovedCount}</strong>
                  </div>
                  <div>
                    <span>Removed for crop</span>
                    <strong>{result.albumDiagnostics.croppedRemovedCount}</strong>
                  </div>
                  <div>
                    <span>Removed for person mismatch</span>
                    <strong>{result.albumDiagnostics.removedNotMatchingMainPersonCount}</strong>
                  </div>
                  <div>
                    <span>Photos left after rules</span>
                    <strong>{result.albumDiagnostics.albumPoolCount}</strong>
                  </div>
                </div>
                <p className="footnote">
                  Try another reference photo, or turn off one of the album filters and process again.
                </p>
              </div>
            ) : (
              <div className="empty-state">Suggested albums will appear after processing.</div>
            )
          )}

          {result?.albumDiagnostics.rejectedPhotos.length ? (
            <div className="album-filtered">
              <strong>Photos removed by album filters</strong>
              <div className="album-filtered-grid">
                {result.albumDiagnostics.rejectedPhotos.map((photo) => (
                  <article className="album-filtered-card" key={photo.photoId}>
                    {previewById.get(photo.photoId) ? (
                      <img src={previewById.get(photo.photoId)} alt={photo.name} />
                    ) : null}
                    <div className="album-filtered-copy">
                      <strong>{photo.name}</strong>
                      <div className="cluster-meta">
                        {photo.reasons.map((reason) => (
                          <span className="meta-pill" key={`${photo.photoId}-${reason}`}>
                            Removed for {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </article>

        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="panel-label">Sharing</p>
              <h2>Share your photos</h2>
            </div>
          </div>

          {result?.share ? (
            <div className="share-card">
              <div className="qr-frame">
                {qrImageUrl ? <img src={qrImageUrl} alt="QR code for share link" /> : null}
              </div>
              <div className="share-copy">
                <strong>{result.share.link}</strong>
                <span>
                  Link expires {formatDate(result.share.expiresAt)}
                </span>
                <span>
                  {result.share.albumTitle
                    ? `QR opens ${result.share.photoCount} photo${result.share.photoCount === 1 ? "" : "s"} from ${result.share.albumTitle}`
                    : `QR opens ${result.share.photoCount} shared photo${result.share.photoCount === 1 ? "" : "s"}`}
                </span>
                <button className="secondary-button" type="button" onClick={copyShareLink}>
                  {copied ? "Copied" : "Copy share link"}
                </button>
                <p className="footnote">Scan the QR code or copy the link to share the selected album.</p>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              {result
                ? "A share link is only created when a main-person album exists. Create a valid album first."
                : "A share link and QR code will appear after processing."}
            </div>
          )}
        </article>
          </section>
        </>
      ) : null}
    </main>
  );
}

function formatBytes(value: number) {
  if (!value) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let unitIndex = 0;

  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  return `${amount.toFixed(amount >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDuration(value: number) {
  if (value < 1000) {
    return `${value} ms`;
  }

  return `${(value / 1000).toFixed(2)} s`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatFaceStatus(status: FaceAnalysisStatus) {
  if (status === "loading-models") {
    return "loading";
  }

  if (status === "analyzing") {
    return "working";
  }

  if (status === "unavailable") {
    return "limited";
  }

  if (status === "ready") {
    return "ready";
  }

  return "waiting";
}

function resolveClusterLabel(
  cluster: FaceCluster | RecognizedFaceCluster,
  index: number,
  backendClusters: FaceCluster[],
  processedById: Map<string, PhotoResult>,
) {
  if (!/^Person\s+\d+$/i.test(cluster.label) && !/^Subject\s+\d+$/i.test(cluster.label) && cluster.label !== "Main Subject") {
    return cluster.label;
  }

  const closestBackendCluster = [...backendClusters]
    .map((candidate) => ({
      label: candidate.label,
      overlap: candidate.photoIds.filter((photoId) => cluster.photoIds.includes(photoId)).length,
    }))
    .sort((left, right) => right.overlap - left.overlap)[0];

  if (closestBackendCluster?.overlap) {
    return closestBackendCluster.label;
  }

  const derivedToken = deriveClusterToken(cluster.photoIds, processedById);
  if (derivedToken) {
    return `${derivedToken} Group`;
  }

  return formatDetectedGroupLabel(index);
}

function deriveClusterToken(photoIds: string[], processedById: Map<string, PhotoResult>) {
  const ignoredTokens = new Set([
    "dsc",
    "img",
    "image",
    "photo",
    "picture",
    "copy",
    "edit",
    "final",
    "jpeg",
    "jpg",
    "png",
    "webp",
    "heic",
  ]);
  const counts = new Map<string, number>();

  for (const photoId of photoIds) {
    const photo = processedById.get(photoId);
    if (!photo) {
      continue;
    }

    const tokens = photo.name
      .replace(/\.[^.]+$/, "")
      .split(/[^a-zA-Z]+/)
      .map((token) => token.toLowerCase())
      .filter((token) => token.length >= 3 && !ignoredTokens.has(token));

    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  const bestToken = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  if (!bestToken) {
    return "";
  }

  return bestToken.charAt(0).toUpperCase() + bestToken.slice(1);
}

function formatClusterName(label: string, index: number) {
  if (/^Person\s+\d+$/i.test(label) || /^Subject\s+\d+$/i.test(label) || label === "Main Subject") {
    return formatDetectedGroupLabel(index);
  }

  return label;
}

function formatDetectedGroupLabel(index: number) {
  return `Group ${index + 1}`;
}

function matchDetectionsToReference(detections: RecognizedFaceDetection[], referencePhotoId: string) {
  const reference = detections.find((detection) => detection.photoId === referencePhotoId);
  if (!reference) {
    return [];
  }

  return detections
    .map((detection) => ({
      photoId: detection.photoId,
      distance: euclideanDistance(reference.descriptor, detection.descriptor),
    }))
    .filter((match) => match.distance <= REFERENCE_MATCH_THRESHOLD)
    .sort((left, right) => left.distance - right.distance)
    .map((match) => match.photoId);
}

function euclideanDistance(left: number[], right: number[]) {
  if (left.length !== right.length || !left.length) {
    return Number.POSITIVE_INFINITY;
  }

  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = left[index] - right[index];
    total += delta * delta;
  }

  return Math.sqrt(total);
}

export default App;
