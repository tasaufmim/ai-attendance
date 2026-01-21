from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import numpy as np
from typing import List, Optional
import base64
import io
import sys
import os
from datetime import datetime

# Import routes and services
from routes import auth
from services import database
# Import models
from models import user, session

# AI service integration
sys.path.append(os.path.join(os.path.dirname(__file__), 'ai-service'))
from face_recognition import get_face_service

app = FastAPI(title="AI Attendance System", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",           # Local development
        "https://ai-attendance.vercel.app", # Vercel production
        "https://*.hf.space",              # Hugging Face Spaces
        "https://huggingface.co",          # Hugging Face main site
        "*"                                # Allow all for demo
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for face-api.js integration
class StudentCreate(BaseModel):
    name: str
    roll_number: str

class FaceRegistration(BaseModel):
    student_id: int
    embedding: List[float]  # Face embedding from face-api.js

class FaceRecognition(BaseModel):
    embedding: List[float]  # Face embedding from face-api.js

class RecognitionResult(BaseModel):
    student_id: Optional[int] = None
    student_name: Optional[str] = None
    confidence: float
    recognized: bool

class AttendanceRecord(BaseModel):
    student_id: int
    timestamp: str
    confidence: float
    location: Optional[str] = None

# In-memory database (will be replaced with MongoDB later)
students_db = {}
attendance_db = []

# Duplicate prevention: track last attendance timestamp per student (in minutes)
last_attendance_times = {}

# Global AI service
face_service = get_face_service()

# Include routers
app.include_router(auth.router, prefix="/auth", tags=["authentication"])

# Initialize face recognition service on startup
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    print("🚀 Initializing AI Attendance System...")
    # Initialize database
    await database.init_db()
    print("Database initialized successfully")
    print("Backend services initialized successfully with real AI models")

# Routes
@app.get("/")
async def root():
    return {"message": "AI Attendance System API", "status": "running"}

@app.post("/students/", response_model=dict)
async def create_student(student: StudentCreate):
    """Create a new student record"""
    student_id = len(students_db) + 1
    students_db[student_id] = {
        "id": student_id,
        "name": student.name,
        "roll_number": student.roll_number,
        "embeddings": None  # Will be set during photo upload
    }
    return {"message": "Student created successfully", "student_id": student_id}

@app.post("/register-face")
async def register_face_embedding(registration: FaceRegistration):
    """Register a face embedding from face-api.js"""
    if registration.student_id not in students_db:
        raise HTTPException(status_code=404, detail="Student not found")

    student_name = students_db[registration.student_id]["name"]
    success = face_service.register_face_from_embedding(
        registration.student_id,
        student_name,
        registration.embedding
    )

    if success:
        return {"message": f"Successfully registered face for student {student_name}"}
    else:
        raise HTTPException(status_code=400, detail="Face registration failed")

@app.post("/face/recognize", response_model=RecognitionResult)
async def recognize_face_embedding(recognition: FaceRecognition):
    """Recognize a face from embedding sent by face-api.js"""
    student_id, student_name, confidence = face_service.recognize_face_from_embedding(
        recognition.embedding
    )

    recognized = student_id is not None

    # If recognized, mark attendance
    if recognized:
        # Check for duplicate attendance (5 minute cooldown)
        current_time = datetime.now()
        last_time = last_attendance_times.get(student_id)

        if last_time and (current_time - last_time).total_seconds() < 300:  # 5 minutes
            # Return result without marking attendance (duplicate)
            return RecognitionResult(
                student_id=student_id,
                student_name=student_name,
                confidence=confidence,
                recognized=True
            )

        # Mark attendance automatically
        timestamp = current_time.isoformat()
        attendance_record = AttendanceRecord(
            student_id=student_id,
            timestamp=timestamp,
            confidence=confidence,
            location="Webcam"
        )
        attendance_db.append(attendance_record.dict())
        last_attendance_times[student_id] = current_time

    return RecognitionResult(
        student_id=student_id,
        student_name=student_name,
        confidence=confidence,
        recognized=recognized
    )

@app.post("/recognize-face", response_model=RecognitionResult)
async def recognize_face_embedding_legacy(recognition: FaceRecognition):
    """Legacy endpoint for face recognition (deprecated, use /face/recognize)"""
    return await recognize_face_embedding(recognition)

@app.get("/attendance/")
async def get_attendance():
    """Get all attendance records"""
    return {"attendance": attendance_db}

@app.delete("/students/{student_id}")
async def delete_student(student_id: int):
    """Delete a student and their face data"""
    if student_id not in students_db:
        raise HTTPException(status_code=404, detail=f"Student with ID {student_id} not found")

    # Remove from database
    deleted_student = students_db[student_id]
    del students_db[student_id]

    # Remove from face recognition service
    try:
        face_service.known_faces.pop(student_id, None)
        face_service.face_names.pop(student_id, None)
        # Save updated database
        face_service.save_database('./ai-service/face_database.pkl')
    except Exception as e:
        print(f"Warning: Could not remove face data for student {student_id}: {e}")

    return {"message": f"Student {deleted_student['name']} (ID: {student_id}) deleted successfully"}

@app.delete("/attendance/all")
async def clear_all_attendance():
    """Clear all attendance records"""
    global attendance_db
    attendance_count = len(attendance_db)
    attendance_db = []

    return {"message": f"Cleared {attendance_count} attendance records successfully"}

@app.delete("/attendance/clear-all")
async def clear_all_attendance_alt():
    """Alternative endpoint to clear all attendance records"""
    return await clear_all_attendance()

@app.delete("/attendance/{student_id}")
async def clear_student_attendance(student_id: int):
    """Clear all attendance records for a specific student"""
    global attendance_db
    initial_count = len(attendance_db)
    attendance_db = [record for record in attendance_db if record['student_id'] != student_id]
    cleared_count = initial_count - len(attendance_db)

    return {"message": f"Cleared {cleared_count} attendance records for student ID {student_id}"}

@app.get("/students/")
async def get_students():
    """Get all students"""
    return {"students": list(students_db.values())}

@app.post("/attendance/")
async def mark_attendance(attendance: AttendanceRecord):
    """Manually mark attendance (for admin)"""
    attendance_db.append(attendance.dict())
    return {"message": "Attendance marked successfully"}

if __name__ == "__main__":
    import os
    # Spaces provides PORT environment variable, default to 8000
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
