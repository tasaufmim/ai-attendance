'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import * as faceapi from 'face-api.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Camera, Users, FileText } from 'lucide-react';

interface RecognitionResult {
  student_id: number | null;
  student_name: string | null;
  confidence: number;
  recognized: boolean;
}

interface Student {
  id: number;
  name: string;
  roll_number: string;
}

export default function Home() {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState<RecognitionResult | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [lastAttendance, setLastAttendance] = useState<{student: string, time: string, date: string} | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(true);

  // Load landmarks preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('showFaceLandmarks');
    if (saved !== null) {
      setShowLandmarks(saved === 'true');
    }
  }, []);
  const [labeledDescriptors, setLabeledDescriptors] = useState<faceapi.LabeledFaceDescriptors[]>([]);

  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load face-api.js models
  useEffect(() => {
    const loadModels = async () => {
      try {
        // Load models from CDN (more reliable than local files)
        const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL)
        ]);
        setModelsLoaded(true);
        console.log('Face-API models loaded successfully');
      } catch (error) {
        console.error('Error loading face-api models:', error);
      }
    };

    loadModels();
  }, []);

  // Load students and create labeled face descriptors
  const loadStudents = useCallback(async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/students/`);
      if (response.ok) {
        const data = await response.json();
        setStudents(data.students);

        // Create labeled descriptors from registered students
        // In a real app, you'd load pre-computed descriptors from the backend
        // For now, we'll create them during recognition
        console.log('Students loaded:', data.students.length);
      }
    } catch (error) {
      console.error('Error loading students:', error);
    }
  }, []);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  // Face detection and recognition with face-api.js
  const detectFaces = useCallback(async () => {
    if (!modelsLoaded || !webcamRef.current?.video) return;

    try {
      const video = webcamRef.current.video;

      // Detect faces in the video with embeddings
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      // Draw detections on canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const displaySize = { width: video.offsetWidth, height: video.offsetHeight };
        faceapi.matchDimensions(canvas, displaySize);

        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        const ctx = canvas.getContext('2d');

        if (ctx) {
          // Clear canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Draw face landmarks (conditionally based on user preference)
          if (showLandmarks) {
            faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
          }

          // Process each detected face for recognition
          if (detections.length > 0) {
            // Recognize each face by sending embedding to backend
            for (let i = 0; i < detections.length; i++) {
              const detection = detections[i];
              const embedding = Array.from(detection.descriptor);

              try {
                // Send embedding to backend for recognition
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/recognize-face`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ embedding }),
                });

                let label = 'Unknown';
                let confidence = 0;
                let isRecognized = false;

                if (response.ok) {
                  const result = await response.json();
                  if (result.recognized && result.student_name) {
                    label = result.student_name;
                    confidence = result.confidence;
                    isRecognized = true;

                    // Mark attendance for recognized faces
                    if (!isProcessing) {
                      setIsProcessing(true);
                      // Show success notification
                      const now = new Date();
                      setLastAttendance({
                        student: result.student_name,
                        time: now.toLocaleTimeString(),
                        date: now.toLocaleDateString()
                      });
                      setShowSuccess(true);
                      setRecognitionResult(result);

                      // Refresh attendance records
                      fetchAttendanceRecords();

                      // Hide success after 5 seconds
                      setTimeout(() => {
                        setShowSuccess(false);
                        setIsProcessing(false);
                      }, 5000);
                    }
                  }
                }

                // Draw recognition result on canvas
                const box = resizedDetections[i].detection.box;
                const confidenceText = isRecognized ? ` (${(confidence * 100).toFixed(0)}%)` : '';
                const text = `${label}${confidenceText}`;

                ctx.strokeStyle = isRecognized ? '#10B981' : '#EF4444';
                ctx.lineWidth = 3;
                ctx.strokeRect(box.x, box.y, box.width, box.height);

                // Draw label background
                ctx.fillStyle = isRecognized ? '#10B981' : '#EF4444';
                const textWidth = ctx.measureText(text).width;
                ctx.fillRect(box.x, box.y - 25, textWidth + 10, 25);

                // Draw label text
                ctx.fillStyle = 'white';
                ctx.font = '16px Arial';
                ctx.fillText(text, box.x + 5, box.y - 5);

              } catch (error) {
                console.error('Recognition error:', error);
                // Draw as unknown on error
                const box = resizedDetections[i].detection.box;
                const text = 'Unknown';

                ctx.strokeStyle = '#EF4444';
                ctx.lineWidth = 3;
                ctx.strokeRect(box.x, box.y, box.width, box.height);

                ctx.fillStyle = '#EF4444';
                ctx.fillRect(box.x, box.y - 25, ctx.measureText(text).width + 10, 25);

                ctx.fillStyle = 'white';
                ctx.font = '16px Arial';
                ctx.fillText(text, box.x + 5, box.y - 5);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Face detection error:', error);
    }
  }, [modelsLoaded, labeledDescriptors, isProcessing]);



  // Load labeled face descriptors from backend
  const loadLabeledDescriptors = useCallback(async () => {
    // For now, we'll create descriptors during recognition
    // In a real implementation, you'd load pre-computed descriptors
    console.log('Face descriptors will be loaded during recognition');
  }, []);

  // Start face detection loop
  useEffect(() => {
    if (modelsLoaded) {
      const interval = setInterval(detectFaces, 100); // 10 FPS detection
      return () => clearInterval(interval);
    }
  }, [modelsLoaded, detectFaces]);

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

  // Load attendance records on mount
  useEffect(() => {
    fetchAttendanceRecords();
  }, []);

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
            modelsLoaded
              ? 'bg-blue-50 text-blue-700'
              : 'bg-orange-50 text-orange-700'
          }`}>
            <div className={`w-2 h-2 rounded-full animate-pulse ${
              modelsLoaded ? 'bg-blue-500' : 'bg-orange-500'
            }`}></div>
            <span className="text-sm font-medium">
              {modelsLoaded ? 'System Active - Real-time face detection' : 'Loading AI models...'}
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

                {/* Processing indicator removed - camera feed stays visible */}

                {/* Success Notification - Top Right Corner */}
                {showSuccess && lastAttendance && (
                  <div className="absolute top-4 right-4 bg-green-500 bg-opacity-95 text-white px-4 py-3 rounded-lg shadow-lg max-w-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-semibold text-sm">Attendance Marked!</span>
                    </div>
                    <p className="text-sm mb-1">Student: {lastAttendance.student}</p>
                    <p className="text-xs opacity-90">
                      {lastAttendance.time} | {lastAttendance.date}
                    </p>
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
            <p>System continuously scans for faces in real-time</p>
            <p>Attendance is marked automatically upon successful recognition</p>
          </div>
          <div className="flex gap-4 justify-center">
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
