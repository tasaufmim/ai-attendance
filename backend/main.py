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

# AI service integration (commented out for demo)
# sys.path.append(os.path.join(os.path.dirname(__file__), 'ai-service'))
# from face_recognition import get_face_service

app = FastAPI(title="AI Attendance System", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://ai-attendance.vercel.app", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class StudentCreate(BaseModel):
    name: str
    roll_number: str

class AttendanceRecord(BaseModel):
    student_id: int
    timestamp: str
    confidence: float
    location: Optional[str] = None

class RecognitionResult(BaseModel):
    student_id: Optional[int] = None
    student_name: Optional[str] = None
    confidence: float
    recognized: bool

# Mock database (replace with real database later)
students_db = {}
attendance_db = []

# Mock AI service for demo
class MockFaceService:
    def __init__(self):
        self.known_faces = {}
        self.face_names = {}
        print("Mock AI service initialized (demo mode)")

    def register_face(self, student_id, student_name, face_images):
        # Mock registration - always succeed
        self.known_faces[student_id] = np.random.rand(512)
        self.face_names[student_id] = student_name
        return True

    def recognize_face(self, image):
        # Mock recognition - randomly recognize registered students
        if self.known_faces:
            student_ids = list(self.known_faces.keys())
            student_id = np.random.choice(student_ids)
            confidence = np.random.uniform(0.85, 0.99)
            return student_id, self.face_names[student_id], confidence
        return None, None, 0.0

    def process_image_from_bytes(self, image_bytes):
        # Mock image processing
        return np.random.rand(480, 640, 3).astype(np.uint8)

# Global mock service
face_service = MockFaceService()

# Initialize face recognition service on startup
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    print("Backend services initialized successfully (demo mode)")

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

@app.post("/students/{student_id}/photos")
async def upload_student_photos(student_id: int, files: List[UploadFile] = File(...)):
    """Upload photos for a student to generate embeddings"""
    if student_id not in students_db:
        raise HTTPException(status_code=404, detail="Student not found")

    # Convert uploaded files to numpy arrays (mock processing)
    face_images = []
    for file in files:
        try:
            contents = await file.read()
            image_np = face_service.process_image_from_bytes(contents)
            face_images.append(image_np)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error processing image: {str(e)}")

    if len(face_images) < 3:
        raise HTTPException(status_code=400, detail="At least 3 photos are required for registration")

    # Register face using AI service (mock)
    student_name = students_db[student_id]["name"]
    success = face_service.register_face(student_id, student_name, face_images)

    if success:
        return {"message": f"Successfully registered {len(face_images)} photos for student {student_name}"}
    else:
        raise HTTPException(status_code=400, detail="Face registration failed. Please ensure photos contain clear, single faces.")

@app.post("/recognize", response_model=RecognitionResult)
async def recognize_face(file: UploadFile = File(...)):
    """Recognize a face from uploaded image"""
    try:
        # Read image (mock processing)
        contents = await file.read()
        image_np = face_service.process_image_from_bytes(contents)

        # Perform recognition (mock)
        student_id, student_name, confidence = face_service.recognize_face(image_np)

        if student_id is not None:
            # Mark attendance automatically
            from datetime import datetime
            timestamp = datetime.now().isoformat()

            attendance_record = AttendanceRecord(
                student_id=student_id,
                timestamp=timestamp,
                confidence=confidence,
                location="Webcam"
            )
            attendance_db.append(attendance_record.dict())

            return RecognitionResult(
                student_id=student_id,
                student_name=student_name,
                confidence=confidence,
                recognized=True
            )
        else:
            return RecognitionResult(
                confidence=confidence,
                recognized=False
            )

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Recognition failed: {str(e)}")

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
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
