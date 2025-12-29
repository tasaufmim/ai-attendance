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
}

export default function Home() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState<RecognitionResult | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [lastAttendance, setLastAttendance] = useState<{student: string, time: string, date: string} | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const webcamRef = useRef<Webcam>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopRecognition = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
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

        const result = await fetch('http://localhost:8000/recognize', {
          method: 'POST',
          body: formData,
        });

        if (result.ok) {
          const data: RecognitionResult = await result.json();
          setRecognitionResult(data);

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
            }, 5000);
          } else if (data.confidence > 0) {
            // Show "face detected but not recognized" briefly
            setTimeout(() => {
              setRecognitionResult(null);
            }, 3000);
          }
        }
      } catch (error) {
        console.error('Error during recognition:', error);
      }
    }, 2000); // Check every 2 seconds
  }, []);

  const fetchAttendanceRecords = async () => {
    try {
      const response = await fetch('http://localhost:8000/attendance/');
      if (response.ok) {
        const data = await response.json();
        setAttendanceRecords(data.attendance);
      }
    } catch (error) {
      console.error('Error fetching attendance:', error);
    }
  };

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
