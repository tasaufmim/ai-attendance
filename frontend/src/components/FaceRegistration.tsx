'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { loadFaceDetectionModels, computeFaceDescriptor } from '../lib/faceDetection';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Loader2, AlertCircle, Camera } from 'lucide-react';

interface FaceRegistrationProps {
  onComplete: (embeddings: number[]) => void;
  onCancel: () => void;
}

type CaptureStep = 'center' | 'left' | 'right' | 'up' | 'complete';

export function FaceRegistration({ onComplete, onCancel }: FaceRegistrationProps) {
  const [step, setStep] = useState<CaptureStep>('center');
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [embeddings, setEmbeddings] = useState<number[][]>([]);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const steps = {
    center: { instruction: 'Look directly at the camera', icon: '👀' },
    left: { instruction: 'Turn your head slightly to the left', icon: '👈' },
    right: { instruction: 'Turn your head slightly to the right', icon: '👉' },
    up: { instruction: 'Tilt your head slightly up', icon: '👆' },
  };

  const currentStep = steps[step as keyof typeof steps];

  // Initialize camera and models
  useEffect(() => {
    let mounted = true;
    let stream: MediaStream | null = null;

    const initialize = async () => {
      try {
        console.log('FaceRegistration: Starting initialization');
        setLoading(true);
        setError(null);

        // Request camera access
        console.log('FaceRegistration: Requesting camera access');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' }
        });
        console.log('FaceRegistration: Camera access granted');

        if (!mounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        setCameraStream(stream);

        // Load face detection models
        console.log('FaceRegistration: Loading face detection models');
        await loadFaceDetectionModels();
        console.log('FaceRegistration: Models loaded, waiting for video element');

        if (mounted) {
          setLoading(false);
        }
      } catch (err) {
        console.error('Initialization error:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to access camera or load face detection models');
          setLoading(false);
        }
      }
    };

    initialize();

    return () => {
      mounted = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Set up video element after component has rendered and camera is ready
  useEffect(() => {
    if (loading || !cameraStream || !videoRef.current) return;

    const setupVideo = async () => {
      const video = videoRef.current!;
      console.log('FaceRegistration: Setting up video element');

      // Set video properties
      video.srcObject = cameraStream;
      video.muted = true;
      video.playsInline = true;
      video.width = 640;
      video.height = 480;

      console.log('FaceRegistration: Video element configured with stream');

      // Wait for video metadata to load
      await new Promise<void>((resolve, reject) => {
        const onLoadedMetadata = async () => {
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onError);

          console.log('FaceRegistration: Video metadata loaded');
          console.log('FaceRegistration: Video dimensions:', video.videoWidth, 'x', video.videoHeight);
          console.log('FaceRegistration: Video element has stream:', !!video.srcObject);

          try {
            // Try to play the video
            await video.play();
            console.log('FaceRegistration: Video playing successfully');
            resolve();
          } catch (playError) {
            console.warn('Autoplay failed, this is expected in some browsers:', playError);
            // In Chrome, autoplay might fail but video can still be displayed
            // Try to play again after a short delay
            setTimeout(async () => {
              try {
                await video.play();
                console.log('FaceRegistration: Video playing after delay');
              } catch (retryError) {
                console.warn('Video play failed even after delay:', retryError);
              }
            }, 100);
            resolve(); // Don't reject, video might still work
          }
        };

        const onError = (error: Event) => {
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onError);
          console.error('FaceRegistration: Video loading error');
          reject(new Error('Video loading failed'));
        };

        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('error', onError);

        // Timeout after 10 seconds
        setTimeout(() => {
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onError);
          console.warn('FaceRegistration: Video loading timeout');
          reject(new Error('Video loading timeout'));
        }, 10000);
      });
    };

    setupVideo().catch(err => {
      console.error('Video setup error:', err);
      setError('Failed to set up video feed');
    });
  }, [loading, cameraStream]);

  const captureFace = useCallback(async () => {
    if (!videoRef.current || capturing) return;

    setCapturing(true);
    setError(null);

    try {
      const descriptor = await computeFaceDescriptor(videoRef.current);

      // Successfully captured face - add to embeddings
      const newEmbeddings = [...embeddings, descriptor];
      setEmbeddings(newEmbeddings);

      // Move to next step
      if (step === 'center') setStep('left');
      else if (step === 'left') setStep('right');
      else if (step === 'right') setStep('up');
      else if (step === 'up') {
        // All steps complete - calculate average embeddings
        const avgEmbeddings = newEmbeddings[0].map((_, i) =>
          newEmbeddings.reduce((sum, emb) => sum + emb[i], 0) / newEmbeddings.length
        );

        // Immediately return embeddings to parent for API registration
        onComplete(avgEmbeddings);
      }
    } catch (err) {
      console.error('Face capture failed:', err);
      const errorMessage = err instanceof Error && err.message === 'No face detected'
        ? 'No face detected. Please position your face clearly in the camera view and ensure good lighting.'
        : 'Failed to capture face. Please try again.';
      setError(errorMessage);
      // Don't advance to next step on error
    } finally {
      setCapturing(false);
    }
  }, [step, embeddings, capturing, onComplete]);

  const handleCancel = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    onCancel();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <Card className="mx-4 w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="text-4xl mb-4">📷</div>
            <h2 className="text-xl font-semibold mb-2">Setting up camera...</h2>
            <p className="text-muted-foreground">Loading face detection models</p>
            <div className="mt-4 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <Card className="w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="p-6 text-center border-b">
          <div className="text-3xl mb-2">{currentStep.icon}</div>
          <h2 className="text-xl font-semibold">Face Registration</h2>
          <p className="text-muted-foreground mt-1">{currentStep.instruction}</p>
        </div>

        {/* Camera View */}
        <div className="relative bg-black w-full h-64">
          <video
            ref={videoRef}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              backgroundColor: 'black'
            }}
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-64"
            style={{ display: 'none' }}
          />

          {/* Face guide overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-32 h-32 border-2 border-white/50 rounded-full flex items-center justify-center">
              <div className="w-24 h-24 border-2 border-white/80 rounded-full"></div>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="px-6 py-4">
          <div className="flex justify-between mb-2">
            {Object.keys(steps).map((stepKey) => (
              <div
                key={stepKey}
                className={`w-3 h-3 rounded-full ${
                  embeddings.length >= Object.keys(steps).indexOf(stepKey) + 1
                    ? 'bg-green-400'
                    : stepKey === step
                    ? 'bg-blue-400'
                    : 'bg-white/30'
                }`}
              />
            ))}
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Step {embeddings.length + 1} of {Object.keys(steps).length}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mb-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <Button
            onClick={handleCancel}
            variant="outline"
            className="flex-1"
            disabled={capturing}
          >
            Cancel
          </Button>
          <Button
            onClick={captureFace}
            disabled={capturing}
            className={`flex-1 ${error ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {capturing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Capturing...
              </>
            ) : error ? (
              'Retry Capture'
            ) : (
              'Capture'
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
