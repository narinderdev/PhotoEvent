import * as faceapi from "face-api.js";

const DEFAULT_MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";
const FACE_DISTANCE_THRESHOLD = 0.52;

let modelsPromise: Promise<void> | null = null;

export type RecognizedFaceCluster = {
  id: string;
  label: string;
  confidence: number;
  photoIds: string[];
  count: number;
};

export type RecognizedFaceDetection = {
  photoId: string;
  descriptor: number[];
  score: number;
};

export type FaceAnalysisResult = {
  clusters: RecognizedFaceCluster[];
  detections: RecognizedFaceDetection[];
};

type DetectionSample = {
  photoId: string;
  descriptor: Float32Array;
  score: number;
};

type WorkingCluster = {
  id: string;
  label: string;
  center: Float32Array;
  photoIds: string[];
  scores: number[];
  distances: number[];
};

export async function preloadFaceRecognitionModels(modelUrl = DEFAULT_MODEL_URL) {
  await ensureModels(modelUrl);
}

export async function analyzePhotoFaces(
  photos: Array<{ id: string; imageUrl: string }>,
  modelUrl = DEFAULT_MODEL_URL,
): Promise<FaceAnalysisResult> {
  await ensureModels(modelUrl);

  const detections: DetectionSample[] = [];
  for (const photo of photos) {
    const image = await loadImage(photo.imageUrl);
    const matches = await faceapi
      .detectAllFaces(
        image,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 512,
          scoreThreshold: 0.45,
        }),
      )
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (!matches.length) {
      continue;
    }

    const primaryMatch = [...matches].sort(
      (left, right) => faceArea(right.detection.box) - faceArea(left.detection.box),
    )[0];

    detections.push({
      photoId: photo.id,
      descriptor: primaryMatch.descriptor,
      score: primaryMatch.detection.score,
    });
  }

  return {
    clusters: clusterDetections(detections),
    detections: detections.map((detection) => ({
      photoId: detection.photoId,
      descriptor: Array.from(detection.descriptor),
      score: detection.score,
    })),
  };
}

async function ensureModels(modelUrl: string) {
  if (!modelsPromise) {
    modelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
      faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl),
      faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl),
    ]).then(() => undefined);
  }

  return modelsPromise;
}

function clusterDetections(detections: DetectionSample[]): RecognizedFaceCluster[] {
  const clusters: WorkingCluster[] = [];

  for (const detection of detections) {
    let bestClusterIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < clusters.length; index += 1) {
      const distance = faceapi.euclideanDistance(clusters[index].center, detection.descriptor);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestClusterIndex = index;
      }
    }

    if (bestClusterIndex >= 0 && bestDistance <= FACE_DISTANCE_THRESHOLD) {
      const cluster = clusters[bestClusterIndex];
      const currentCount = cluster.photoIds.length;

      cluster.center = averageDescriptor(cluster.center, detection.descriptor, currentCount);
      cluster.photoIds.push(detection.photoId);
      cluster.scores.push(detection.score);
      cluster.distances.push(bestDistance);
      continue;
    }

    clusters.push({
      id: `vision-${clusters.length + 1}`,
      label: `Person ${clusters.length + 1}`,
      center: detection.descriptor,
      photoIds: [detection.photoId],
      scores: [detection.score],
      distances: [],
    });
  }

  return clusters
    .map((cluster) => {
      const averageScore = cluster.scores.reduce((sum, score) => sum + score, 0) / cluster.scores.length;
      const averageDistance = cluster.distances.length
        ? cluster.distances.reduce((sum, distance) => sum + distance, 0) / cluster.distances.length
        : FACE_DISTANCE_THRESHOLD * 0.18;
      const distanceConfidence = clamp(1 - averageDistance / FACE_DISTANCE_THRESHOLD, 0.5, 0.99);
      const confidence = Number((averageScore * 0.45 + distanceConfidence * 0.55).toFixed(2));

      return {
        id: cluster.id,
        label: cluster.label,
        confidence,
        photoIds: cluster.photoIds,
        count: cluster.photoIds.length,
      };
    })
    .sort((left, right) => right.count - left.count);
}

function averageDescriptor(current: Float32Array, next: Float32Array, count: number) {
  const merged = new Float32Array(current.length);
  for (let index = 0; index < current.length; index += 1) {
    merged[index] = (current[index] * count + next[index]) / (count + 1);
  }
  return merged;
}

function faceArea(box: faceapi.Box) {
  return box.width * box.height;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image for face recognition."));
    image.src = src;
  });
}
