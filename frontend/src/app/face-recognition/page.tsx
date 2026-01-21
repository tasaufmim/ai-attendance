'use client';

import React, { useRef, useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Webcam, UserCheck, UserPlus, Loader2, Camera, AlertCircle } from 'lucide-react';
import { FaceRegistration } from '../../components/FaceRegistration';
import AuthWrapper from '@/components/AuthWrapper';

export default function FaceRecognitionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [showFaceRegistration, setShowFaceRegistration] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  // Check if this is student registration mode (from admin panel)
  const studentId = searchParams.get('studentId');
  const isStudentMode = studentId !== null;

  // Auto-start registration modal in student mode
  useEffect(() => {
    if (isStudentMode) {
      // Small delay to ensure component is fully mounted
      const timer = setTimeout(() => {
        setShowFaceRegistration(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isStudentMode]);

  const startCamera = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraStream(stream);
        setIsCameraActive(true);
      }
    } catch (err) {
      setError('Camera access denied. Please allow camera access and try again.');
      console.error('Camera error:', err);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
    setRecognitionResult(null);
  };

  const captureFrame = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to base64 image data
    return canvas.toDataURL('image/jpeg', 0.8);
  };

  const startRecognition = async () => {
    if (!isCameraActive) {
      setError('Please start the camera first.');
      return;
    }

    setIsRecognizing(true);
    setError(null);
    setRecognitionResult(null);

    try {
      const frameData = captureFrame();
      if (!frameData) {
        throw new Error('Could not capture video frame');
      }

      const response = await fetch(`${API_URL}/face/recognize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: frameData.split(',')[1], // Remove data URL prefix
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Recognition failed');
      }

      const result = await response.json();
      setRecognitionResult(result);
      
      if (result.success && result.attendance_marked) {
        // Success - show result for 3 seconds then redirect
        setTimeout(() => {
          router.push('/');
        }, 3000);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recognition failed');
    } finally {
      setIsRecognizing(false);
    }
  };

  const registerFace = () => {
    setShowFaceRegistration(true);
  };

  const handleFaceRegistrationComplete = async (embeddings: number[]) => {
    setShowFaceRegistration(false);
    setError(null);

    try {
      let response;

      if (isStudentMode && studentId) {
        // Student registration mode - send to attendance system
        response = await fetch(`${API_URL}/register-face`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            student_id: parseInt(studentId),
            embedding: embeddings
          }),
        });
      } else {
        // User authentication registration mode - simplified without auth for now
        response = await fetch(`${API_URL}/auth/face/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            face_embeddings: embeddings
          }),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Face registration failed');
      }

      const result = await response.json();

      if (isStudentMode) {
        // Redirect back to admin page with success message
        setRecognitionResult({
          success: true,
          message: result.message || 'Student face registered successfully!'
        });
        // Redirect back to admin after showing success
        setTimeout(() => {
          window.location.href = '/admin';
        }, 2000);
      } else {
        setRecognitionResult({
          success: true,
          message: 'Face registered successfully! You can now mark attendance.'
        });
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Face registration failed');
    }
  };

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      stopCamera();
    };
  }, []);

  return (
    <AuthWrapper>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {isStudentMode ? 'Student Face Registration' : 'Face Recognition Attendance'}
          </h1>
          <p className="text-gray-600">
            {isStudentMode
              ? `Register face for Student ID: ${studentId} using pose-guided capture`
              : 'Use your webcam to mark attendance with AI-powered face recognition'
            }
          </p>
        </div>

        {/* Error Display - only show in non-student mode */}
        {error && !isStudentMode && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Show success message for student mode before redirect */}
        {isStudentMode && recognitionResult?.success && (
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <div className="text-4xl mb-4">✅</div>
              <h2 className="text-xl font-semibold mb-2 text-green-600">Registration Complete!</h2>
              <p className="text-muted-foreground">{recognitionResult.message}</p>
              <p className="text-sm text-muted-foreground mt-4">Redirecting to admin panel...</p>
            </CardContent>
          </Card>
        )}

        {/* Show full interface only for non-student mode */}
        {!isStudentMode && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Camera Feed */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Webcam className="h-6 w-6" />
                  Live Camera Feed
                </CardTitle>
                <CardDescription>
                  Position your face within the frame for best recognition results
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }} // Mirror effect
                  />
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Camera overlay */}
                  {!isCameraActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                      <div className="text-center text-white">
                        <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>Camera not active</p>
                      </div>
                    </div>
                  )}

                  {/* Face detection overlay */}
                  {isCameraActive && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute top-4 left-4 bg-green-500 w-4 h-4 rounded-full animate-pulse"></div>
                      <div className="absolute top-4 right-4 bg-green-500 w-4 h-4 rounded-full animate-pulse"></div>
                      <div className="absolute bottom-4 left-4 bg-green-500 w-4 h-4 rounded-full animate-pulse"></div>
                      <div className="absolute bottom-4 right-4 bg-green-500 w-4 h-4 rounded-full animate-pulse"></div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={isCameraActive ? stopCamera : startCamera}
                    className="flex-1"
                    variant={isCameraActive ? "outline" : "default"}
                  >
                    {isCameraActive ? 'Stop Camera' : 'Start Camera'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Controls and Results */}
            <div className="space-y-6">
              {/* Recognition Controls */}
              <Card>
                <CardHeader>
                  <CardTitle>{isStudentMode ? 'Face Registration' : 'Face Recognition'}</CardTitle>
                  <CardDescription>
                    {isStudentMode
                      ? 'Register student face using pose-guided capture'
                      : 'Mark your attendance using face recognition'
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!isStudentMode && (
                    <Button
                      onClick={startRecognition}
                      disabled={!isCameraActive || isRecognizing}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                    >
                      {isRecognizing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Recognizing...
                        </>
                      ) : (
                        <>
                          <UserCheck className="mr-2 h-4 w-4" />
                          Mark Attendance
                        </>
                      )}
                    </Button>
                  )}

                  <Button
                    onClick={registerFace}
                    disabled={!isCameraActive}
                    variant={isStudentMode ? "default" : "outline"}
                    className={`w-full ${isStudentMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    {isStudentMode ? 'Start Pose-Guided Registration' : 'Register Face'}
                  </Button>
                </CardContent>
              </Card>

              {/* Results Display */}
              {recognitionResult && (
                <Card>
                  <CardHeader>
                    <CardTitle>Recognition Results</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {recognitionResult.success ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                            <UserCheck className="h-6 w-6 text-green-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-green-600">Recognition Successful!</h3>
                            <p className="text-sm text-gray-600">{recognitionResult.message || 'Welcome back!'}</p>
                          </div>
                        </div>

                        {recognitionResult.attendance_marked && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <p className="text-green-800 font-medium">Attendance Marked</p>
                            <p className="text-green-700 text-sm">Time: {new Date(recognitionResult.timestamp).toLocaleTimeString()}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                            <AlertCircle className="h-6 w-6 text-red-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-red-600">Recognition Failed</h3>
                            <p className="text-sm text-gray-600">{recognitionResult.message || 'Face not recognized'}</p>
                          </div>
                        </div>

                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-red-800 text-sm">Please try again or register your face first.</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Instructions */}
              <Card>
                <CardHeader>
                  <CardTitle>Instructions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-gray-600">
                  <div className="flex gap-2">
                    <span className="font-semibold">1.</span>
                    <span>Click "Start Camera" to activate your webcam</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold">2.</span>
                    <span>Position your face clearly within the frame</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold">3.</span>
                    <span>Click "Mark Attendance" to recognize your face</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold">4.</span>
                    <span>First time users should click "Register Face" first</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Face Registration Modal */}
        {showFaceRegistration && (
          <FaceRegistration
            onComplete={handleFaceRegistrationComplete}
            onCancel={() => setShowFaceRegistration(false)}
          />
        )}
      </div>
    </div>
    </AuthWrapper>
  );
}
