'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Camera, Users, FileText } from 'lucide-react';

interface RecognitionResult {
  student_id: number | null;
  student_name: string | null;
  confidence: number;
  recognized: boolean;
  bbox?: number[];        // For embedding (larger)
  display_bbox?: number[]; // For display (tighter)
}

interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export default function Home() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState<RecognitionResult | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [lastAttendance, setLastAttendance] = useState<{student: string, time: string, date: string} | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [boundingBoxes, setBoundingBoxes] = useState<BBox[]>([]);
  const [faceLabels, setFaceLabels] = useState<{name: string, bbox: BBox, recognized: boolean}[]>([]);
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopRecognition = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const drawBoundingBoxes = (faces: {name: string, bbox: BBox, recognized: boolean}[]) => {
    console.log('drawBoundingBoxes called with:', faces); // Debug: function called

    const canvas = canvasRef.current;
    const video = webcamRef.current?.video;
    if (!canvas || !video) {
      console.log('Canvas or video not available', { canvas: !!canvas, video: !!video }); // Debug: missing elements
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.log('Could not get canvas context'); // Debug: no context
      return;
    }

    // Get video element's actual display size and position
    const videoRect = video.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    console.log('Video rect:', videoRect); // Debug: video dimensions
    console.log('Canvas rect:', canvasRect); // Debug: canvas dimensions

    // Calculate scaling factors
    const scaleX = videoRect.width / 640;  // Original capture width
    const scaleY = videoRect.height / 480; // Original capture height

    console.log('Scale factors:', { scaleX, scaleY }); // Debug: scaling

    // Calculate offset to align canvas with video
    const offsetX = videoRect.left - canvasRect.left;
    const offsetY = videoRect.top - canvasRect.top;

    console.log('Offsets:', { offsetX, offsetY }); // Debug: offsets

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw each bounding box with proper scaling
    faces.forEach((face, index) => {
      const { bbox, recognized, name } = face;

      console.log(`Drawing face ${index}:`, { bbox, recognized, name }); // Debug: face data

      // Scale bbox coordinates to match displayed video size
      const scaledX1 = bbox.x1 * scaleX + offsetX;
      const scaledY1 = bbox.y1 * scaleY + offsetY;
      const scaledX2 = bbox.x2 * scaleX + offsetX;
      const scaledY2 = bbox.y2 * scaleY + offsetY;

      console.log('Scaled coordinates:', { scaledX1, scaledY1, scaledX2, scaledY2 }); // Debug: scaled coords

      // Set color based on recognition status
      ctx.strokeStyle = recognized ? '#10B981' : '#EF4444'; // Green for recognized, red for unknown
      ctx.lineWidth = 3;
      ctx.strokeRect(scaledX1, scaledY1, scaledX2 - scaledX1, scaledY2 - scaledY1);

      // Draw background for text
      const text = recognized ? name : 'Unknown';
      ctx.font = '16px Arial';
      const textWidth = ctx.measureText(text).width;
      const textHeight = 20;

      ctx.fillStyle = recognized ? '#10B981' : '#EF4444';
      ctx.fillRect(scaledX1, scaledY1 - textHeight - 5, textWidth + 10, textHeight + 5);

      // Draw text
      ctx.fillStyle = 'white';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(text, scaledX1 + 5, scaledY1 - 5);

      console.log(`Drew bounding box for ${text}`); // Debug: drawing complete
    });
  };

  const startContinuousRecognition = useCallback(() => {
    intervalRef.current = setInterval(async () => {
      if (!webcamRef.current) return;

      try {
        const imageSrc = webcamRef.current.getScreenshot();
        if (!imageSrc) return;

        // Convert base64 to blob
        const response = await fetch(imageSrc);
        const blob = await response.blob();

        // Send to backend for recognition
        const formData = new FormData();
        formData.append('file', blob, 'capture.jpg');

        const result = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/recognize`, {
          method: 'POST',
          body: formData,
        });

        if (result.ok) {
          const data: RecognitionResult = await result.json();
          console.log('API Response:', data); // Debug: log full response
          setRecognitionResult(data);

          // Draw bounding box if available (prefer display_bbox for visual feedback)
          const bboxForDisplay = data.display_bbox || data.bbox;
          if (bboxForDisplay) {
            console.log('Drawing bbox:', bboxForDisplay, '(display_bbox preferred)'); // Debug: log bbox data
            const bbox: BBox = {
              x1: bboxForDisplay[0],
              y1: bboxForDisplay[1],
              x2: bboxForDisplay[2],
              y2: bboxForDisplay[3]
            };
            const faces = [{
              name: data.student_name || 'Unknown',
              bbox,
              recognized: data.recognized
            }];
            console.log('Calling drawBoundingBoxes with:', faces); // Debug: log what we're drawing
            drawBoundingBoxes(faces);
          } else {
            console.log('No bbox data in response'); // Debug: no bbox case
          }

          if (data.recognized && data.student_name) {
            // Stop continuous recognition after successful attendance
            stopRecognition();

            // Mark attendance and show success
            setIsProcessing(true);

            // Set success message with timestamp
            const now = new Date();
            const time = now.toLocaleTimeString();
            const date = now.toLocaleDateString();

            setLastAttendance({
              student: data.student_name,
              time: time,
              date: date
            });

            setShowSuccess(true);

            // Refresh attendance records
            fetchAttendanceRecords();

            // Hide success message after 5 seconds but don't restart scanning
            setTimeout(() => {
              setShowSuccess(false);
              setIsProcessing(false);
              setRecognitionResult(null);
              // Keep bounding boxes visible for next recognition
            }, 5000);
          } else if (data.confidence > 0) {
            // Show "face detected but not recognized" briefly
            setTimeout(() => {
              setRecognitionResult(null);
              // Keep bounding boxes visible for next recognition
            }, 3000);
          } else {
            // No face detected, keep boxes visible for next recognition
            // Don't clear boxes here
          }
        }
      } catch (error) {
        console.error('Error during recognition:', error);
      }
    }, 2000); // Check every 2 seconds
  }, []);

  const fetchAttendanceRecords = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/attendance/`);
      if (response.ok) {
        const data = await response.json();
        setAttendanceRecords(data.attendance);
      }
    } catch (error) {
      console.error('Error fetching attendance:', error);
    }
  };

  // Resize canvas to match video dimensions
  useEffect(() => {
    const resizeCanvas = () => {
      const video = webcamRef.current?.video;
      const canvas = canvasRef.current;
      if (video && canvas) {
        const rect = video.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };

    // Resize on mount and when video loads
    if (webcamRef.current?.video) {
      webcamRef.current.video.addEventListener('loadedmetadata', resizeCanvas);
      resizeCanvas();
    }

    // Cleanup
    return () => {
      if (webcamRef.current?.video) {
        webcamRef.current.video.removeEventListener('loadedmetadata', resizeCanvas);
      }
    };
  }, []);

  // Start continuous recognition when component mounts
  useEffect(() => {
    startContinuousRecognition();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [startContinuousRecognition]);

  const videoConstraints = {
    width: 640,
    height: 480,
    facingMode: 'user',
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            AI Attendance System
          </h1>
          <p className="text-lg text-gray-600 mb-4">
            Hands-free face recognition attendance tracking
          </p>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${
            intervalRef.current
              ? 'bg-blue-50 text-blue-700'
              : 'bg-orange-50 text-orange-700'
          }`}>
            <div className={`w-2 h-2 rounded-full animate-pulse ${
              intervalRef.current ? 'bg-blue-500' : 'bg-orange-500'
            }`}></div>
            <span className="text-sm font-medium">
              {intervalRef.current ? 'System Active - Scanning for faces' : 'System Paused - Ready to scan'}
            </span>
          </div>
        </div>

        {/* Camera Section */}
        <div className="mb-8">
          <Card className="max-w-4xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <Camera className="w-6 h-6" />
                Live Camera Feed
              </CardTitle>
              <CardDescription>
                Position your face in front of the camera. Attendance will be marked automatically when recognized.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative mx-auto max-w-2xl">
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  videoConstraints={videoConstraints}
                  className="w-full rounded-lg border-2 border-gray-200"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 pointer-events-none"
                  width={640}
                  height={480}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />

                {/* Processing Overlay */}
                {isProcessing && (
                  <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center rounded-lg">
                    <div className="text-white text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                      <p className="text-lg font-semibold">Processing...</p>
                      <p className="text-sm opacity-90">Marking attendance</p>
                    </div>
                  </div>
                )}

                {/* Success Overlay */}
                {showSuccess && lastAttendance && (
                  <div className="absolute inset-0 bg-green-500 bg-opacity-90 flex items-center justify-center rounded-lg">
                    <div className="text-white text-center">
                      <CheckCircle className="w-16 h-16 mx-auto mb-4" />
                      <h3 className="text-2xl font-bold mb-2">Attendance Marked!</h3>
                      <p className="text-lg mb-1">Student: {lastAttendance.student}</p>
                      <p className="text-sm opacity-90">
                        {lastAttendance.time} | {lastAttendance.date}
                      </p>
                    </div>
                  </div>
                )}

                {/* Recognition Status */}
                {recognitionResult && !recognitionResult.recognized && !showSuccess && (
                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="bg-yellow-500 bg-opacity-90 text-white p-3 rounded-lg text-center">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <AlertCircle className="w-5 h-5" />
                        <span className="font-medium">Face Detected - Not Recognized</span>
                      </div>
                      <p className="text-sm opacity-90">
                        Please contact administrator if you believe this is an error.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Attendance Records */}
        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Recent Attendance Records
            </CardTitle>
            <CardDescription>
              Latest attendance records from all students
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {attendanceRecords.length === 0 ? (
                <div className="col-span-full">
                  <p className="text-gray-500 text-center py-12 text-lg">
                    No attendance records yet. Students will appear here when recognized.
                  </p>
                </div>
              ) : (
                attendanceRecords.slice(-12).reverse().map((record, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-lg border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">Student ID: {record.student_id}</span>
                      <Badge variant="secondary" className="text-xs">
                        {(record.confidence * 100).toFixed(1)}%
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">
                      {new Date(record.timestamp).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={fetchAttendanceRecords}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Refresh Records
              </button>
            </div>
          </CardContent>
        </Card>

        {/* System Info & Admin Link */}
        <div className="text-center mt-8 space-y-4">
          <div className="text-sm text-gray-500">
            <p>System continuously scans for faces every 2 seconds</p>
            <p>Attendance is marked automatically upon successful recognition</p>
          </div>
          <div className="flex gap-4 justify-center">
            {!intervalRef.current && (
              <button
                onClick={startContinuousRecognition}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Camera className="w-4 h-4" />
                Resume Scanning
              </button>
            )}
            <a
              href="/admin"
              className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Users className="w-4 h-4" />
              Admin Panel
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
