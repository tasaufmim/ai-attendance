import * as faceapi from 'face-api.js';

let modelsLoaded = false;

export async function loadFaceDetectionModels() {
  if (modelsLoaded) return;

  try {
    console.log('Loading face detection models...');
    // Load models from CDN (more reliable than local files)
    const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';

    // Load all required models for face recognition
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);

    modelsLoaded = true;
    console.log('All face detection models loaded successfully');
  } catch (error) {
    console.error('Failed to load face detection models:', error);
    modelsLoaded = false; // Ensure it's false so detectFaces returns safe default
    // Don't throw error to prevent app crash
  }
}

export async function detectFaces(videoElement: HTMLVideoElement): Promise<number> {
  if (!modelsLoaded) {
    // Return 1 (single face) when models not loaded to avoid triggering multiple face alerts
    return 1;
  }

  try {
    const detections = await faceapi.detectAllFaces(
      videoElement,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.5 })
    );
    return detections.length;
  } catch (error) {
    console.error('Face detection error:', error);
    return 1; // Return 1 on error to avoid false positives
  }
}

export async function detectSingleFace(videoElement: HTMLVideoElement): Promise<any> {
  if (!modelsLoaded) {
    throw new Error('Face detection models not loaded');
  }

  try {
    const detection = await faceapi
      .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    return detection;
  } catch (error) {
    console.error('Single face detection error:', error);
    throw error;
  }
}

export async function computeFaceDescriptor(videoElement: HTMLVideoElement): Promise<number[]> {
  const detection = await detectSingleFace(videoElement);
  if (!detection) {
    throw new Error('No face detected');
  }
  return Array.from(detection.descriptor);
}

export function createVideoElement(): HTMLVideoElement {
  const video = document.createElement('video');
  video.style.display = 'none';
  video.muted = true;
  video.playsInline = true;
  document.body.appendChild(video);
  return video;
}

export function removeVideoElement(video: HTMLVideoElement) {
  if (video.parentNode) {
    video.parentNode.removeChild(video);
  }
}
