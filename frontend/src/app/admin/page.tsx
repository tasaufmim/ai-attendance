'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as faceapi from 'face-api.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle, Upload, Users, FileText, Plus, Camera, Trash2, RotateCcw } from 'lucide-react';

interface Student {
  id: number;
  name: string;
  roll_number: string;
}

interface AttendanceRecord {
  student_id: number;
  timestamp: string;
  confidence: number;
  location: string;
}

export default function AdminPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // New student form
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentRoll, setNewStudentRoll] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [selectedStudentForClearance, setSelectedStudentForClearance] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const fetchStudents = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/students/`);
      if (response.ok) {
        const data = await response.json();
        setStudents(data.students);
      }
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const fetchAttendance = async () => {
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

  const createStudent = async () => {
    if (!newStudentName.trim() || !newStudentRoll.trim()) {
      showMessage('error', 'Please fill in both name and roll number');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/students/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newStudentName.trim(),
          roll_number: newStudentRoll.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        showMessage('success', `Student created successfully with ID: ${data.student_id}`);
        setNewStudentName('');
        setNewStudentRoll('');
        fetchStudents();
      } else {
        const error = await response.json();
        showMessage('error', error.detail || 'Failed to create student');
      }
    } catch (error) {
      console.error('Error creating student:', error);
      showMessage('error', 'Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const uploadStudentPhotos = async () => {
    if (!selectedStudentId || !selectedFiles || selectedFiles.length === 0) {
      showMessage('error', 'Please select a student and upload at least one photo');
      return;
    }

    if (selectedFiles.length < 3) {
      showMessage('error', 'Please upload at least 3 photos for accurate recognition');
      return;
    }

    if (!modelsLoaded) {
      showMessage('error', 'AI models are still loading. Please wait.');
      return;
    }

    setIsLoading(true);
    try {
      const embeddings: Float32Array[] = [];

      // Process each uploaded photo with face-api.js
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        console.log(`Processing photo ${i + 1}/${selectedFiles.length}: ${file.name}`);

        // Convert file to HTMLImageElement
        const img = new Image();
        const imageUrl = URL.createObjectURL(file);

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = imageUrl;
        });

        // Detect face and extract embedding
        const detection = await faceapi
          .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection) {
          embeddings.push(detection.descriptor);
          console.log(`Face detected and embedding extracted from ${file.name}`);
        } else {
          console.warn(`No face detected in ${file.name}`);
        }

        // Clean up object URL
        URL.revokeObjectURL(imageUrl);
      }

      if (embeddings.length === 0) {
        showMessage('error', 'No faces detected in the uploaded photos. Please ensure photos contain clear faces.');
        return;
      }

      if (embeddings.length < 3) {
        showMessage('error', `Only ${embeddings.length} faces detected. Please upload more photos with clear faces.`);
        return;
      }

      // Calculate average embedding from all photos
      const avgEmbedding = new Array(128).fill(0);
      for (const embedding of embeddings) {
        for (let j = 0; j < embedding.length; j++) {
          avgEmbedding[j] += embedding[j];
        }
      }
      for (let j = 0; j < avgEmbedding.length; j++) {
        avgEmbedding[j] /= embeddings.length;
      }

      console.log(`Calculated average embedding from ${embeddings.length} photos`);

      // Send embedding to backend for registration
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/register-face`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          student_id: selectedStudentId,
          embedding: avgEmbedding,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        showMessage('success', data.message);
        setSelectedFiles(null);
        setSelectedStudentId(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        // Refresh students to show updated data
        fetchStudents();
      } else {
        const error = await response.json();
        showMessage('error', error.detail || 'Failed to register face');
      }
    } catch (error) {
      console.error('Error processing photos:', error);
      showMessage('error', 'Failed to process photos. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setSelectedFiles(files);
    }
  };

  const deleteStudent = async (studentId: number, studentName: string) => {
    if (!confirm(`Are you sure you want to delete student "${studentName}"? This will remove all their face data and cannot be undone.`)) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/students/${studentId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const data = await response.json();
        showMessage('success', data.message);
        fetchStudents();
        fetchAttendance(); // Refresh attendance in case the student had records
      } else {
        const error = await response.json();
        if (response.status === 404) {
          showMessage('error', 'Student not found. The server may have restarted and cleared demo data.');
        } else {
          showMessage('error', error.detail || 'Failed to delete student');
        }
      }
    } catch (error) {
      console.error('Error deleting student:', error);
      showMessage('error', 'Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const clearAllAttendance = async () => {
    if (!confirm('Are you sure you want to clear ALL attendance records? This action cannot be undone.')) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/attendance/clear-all`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const data = await response.json();
        showMessage('success', data.message);
        fetchAttendance();
      } else {
        const error = await response.json();
        showMessage('error', error.detail || 'Failed to clear attendance records');
      }
    } catch (error) {
      console.error('Error clearing attendance:', error);
      showMessage('error', 'Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const clearStudentAttendance = async () => {
    if (!selectedStudentForClearance) return;

    const student = students.find(s => s.id === selectedStudentForClearance);
    if (!student) return;

    if (!confirm(`Are you sure you want to clear all attendance records for "${student.name}"?`)) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/attendance/${selectedStudentForClearance}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const data = await response.json();
        showMessage('success', data.message);
        fetchAttendance();
        setSelectedStudentForClearance(null);
      } else {
        const error = await response.json();
        showMessage('error', error.detail || 'Failed to clear student attendance records');
      }
    } catch (error) {
      console.error('Error clearing student attendance:', error);
      showMessage('error', 'Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Load face-api.js models and data on component mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        setModelsLoaded(true);
        console.log('Face-API models loaded successfully');
      } catch (error) {
        console.error('Error loading face-api models:', error);
        showMessage('error', 'Failed to load AI models. Please refresh the page.');
      }
    };

    loadModels();
    fetchStudents();
    fetchAttendance();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Admin Panel
          </h1>
          <p className="text-lg text-gray-600 mb-4">
            Manage students and view attendance records
          </p>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 max-w-2xl mx-auto">
            <div className="flex items-center justify-center gap-2 text-yellow-800">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm font-medium">
                Demo System: Data is temporary and will be cleared when the server restarts
              </span>
            </div>
          </div>

          {/* Face Landmarks Toggle */}
          <div className="flex justify-center mt-4">
            <button
              onClick={() => {
                const newValue = !showLandmarks;
                setShowLandmarks(newValue);
                localStorage.setItem('showFaceLandmarks', newValue.toString());
                showMessage('success', `Face landmarks ${newValue ? 'enabled' : 'disabled'} for the main camera view`);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                showLandmarks
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {showLandmarks ? 'Hide Face Landmarks' : 'Show Face Landmarks'}
            </button>
          </div>
        </div>

        {/* Message Display */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg max-w-md mx-auto ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              <span>{message.text}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Student Management */}
          <div className="space-y-6">
            {/* Create New Student */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Create New Student
                </CardTitle>
                <CardDescription>
                  Add a new student to the system
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="studentName">Student Name</Label>
                  <Input
                    id="studentName"
                    placeholder="Enter student name"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="studentRoll">Roll Number</Label>
                  <Input
                    id="studentRoll"
                    placeholder="Enter roll number"
                    value={newStudentRoll}
                    onChange={(e) => setNewStudentRoll(e.target.value)}
                  />
                </div>
                <Button
                  onClick={createStudent}
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? 'Creating...' : 'Create Student'}
                </Button>
              </CardContent>
            </Card>

            {/* Upload Student Photos */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Register Student Face
                </CardTitle>
                <CardDescription>
                  Upload multiple photos to train the AI recognition system
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="studentSelect">Select Student</Label>
                  <select
                    id="studentSelect"
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={selectedStudentId || ''}
                    onChange={(e) => setSelectedStudentId(Number(e.target.value) || null)}
                  >
                    <option value="">Choose a student...</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name} (Roll: {student.roll_number})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="photoUpload">Upload Photos</Label>
                  <input
                    id="photoUpload"
                    type="file"
                    multiple
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Upload at least 3 clear photos from different angles
                  </p>
                </div>

                {selectedFiles && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      {selectedFiles.length} file(s) selected
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={uploadStudentPhotos}
                    disabled={isLoading || !selectedStudentId || !selectedFiles || !modelsLoaded}
                    className="flex-1"
                  >
                    {isLoading ? 'Processing...' : !modelsLoaded ? 'Loading AI Models...' : 'Upload & Register Face'}
                  </Button>

                  <Button
                    onClick={() => {
                      if (!selectedStudentId) {
                        showMessage('error', 'Please select a student first');
                        return;
                      }
                      // Navigate to face registration page with student ID
                      window.location.href = `/face-recognition?studentId=${selectedStudentId}`;
                    }}
                    disabled={!selectedStudentId}
                    variant="outline"
                    className="flex-1"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Open Camera
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Students List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Registered Students
                </CardTitle>
                <CardDescription>
                  All students in the system
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {students.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      No students registered yet
                    </p>
                  ) : (
                    students.map((student) => (
                      <div key={student.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">{student.name}</p>
                          <p className="text-sm text-gray-600">Roll: {student.roll_number}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">ID: {student.id}</Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteStudent(student.id, student.name)}
                            disabled={isLoading}
                            className="text-red-600 hover:text-red-800 hover:bg-red-50 border-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={fetchStudents}
                  className="w-full mt-4"
                >
                  Refresh Students
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Attendance Records */}
          <div className="space-y-6">
            {/* Clear Attendance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RotateCcw className="w-5 h-5" />
                  Clear Attendance Records
                </CardTitle>
                <CardDescription>
                  Remove attendance data from the system
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={clearAllAttendance}
                    disabled={isLoading}
                    className="text-red-600 hover:text-red-800 hover:bg-red-50 border-red-300"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Clear All Records
                  </Button>
                  <select
                    className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={selectedStudentForClearance || ''}
                    onChange={(e) => setSelectedStudentForClearance(Number(e.target.value) || null)}
                  >
                    <option value="">Select student...</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name} (ID: {student.id})
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="outline"
                  onClick={clearStudentAttendance}
                  disabled={isLoading || !selectedStudentForClearance}
                  className="w-full text-orange-600 hover:text-orange-800 hover:bg-orange-50 border-orange-300"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Clear Selected Student Records
                </Button>
              </CardContent>
            </Card>

            {/* Attendance Records List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Attendance Records ({attendanceRecords.length})
                </CardTitle>
                <CardDescription>
                  All attendance records with timestamps
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {attendanceRecords.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      No attendance records yet
                    </p>
                  ) : (
                    attendanceRecords.slice().reverse().map((record, index) => (
                      <div key={index} className="p-4 bg-gray-50 rounded-lg border">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-900">Student ID: {record.student_id}</span>
                          <Badge variant="secondary" className="text-xs">
                            {(record.confidence * 100).toFixed(1)}%
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-1">
                          {new Date(record.timestamp).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">
                          Location: {record.location}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={fetchAttendance}
                  className="w-full mt-4"
                >
                  Refresh Records
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Navigation */}
        <div className="text-center mt-8">
          <a
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Camera className="w-4 h-4" />
            Back to Attendance System
          </a>
        </div>
      </div>
    </div>
  );
}
