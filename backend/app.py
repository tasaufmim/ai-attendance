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
    bbox: Optional[List[int]] = None  # [x1, y1, x2, y2] - for embedding
    display_bbox: Optional[List[int]] = None  # [x1, y1, x2, y2] - for display

class MultiRecognitionResult(BaseModel):
    results: List[RecognitionResult]
    total_faces: int
    recognized_count: int
    processing_time: float

# In-memory database (will be replaced with MongoDB later)
students_db = {}
attendance_db = []

# Duplicate prevention: track last attendance timestamp per student (in minutes)
last_attendance_times = {}

# Global AI service
face_service = get_face_service()

# Initialize face recognition service on startup
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    print("🚀 Initializing AI Attendance System...")
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

@app.post("/students/{student_id}/photos")
async def upload_student_photos(student_id: int, files: List[UploadFile] = File(...)):
    """Upload photos for a student to generate embeddings"""
    if student_id not in students_db:
        raise HTTPException(status_code=404, detail="Student not found")

    # Convert uploaded files to numpy arrays
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

    # Register face using AI service
    student_name = students_db[student_id]["name"]
    success = face_service.register_face(student_id, student_name, face_images)

    if success:
        return {"message": f"Successfully registered {len(face_images)} photos for student {student_name}"}
    else:
        raise HTTPException(status_code=400, detail="Face registration failed. Please ensure photos contain clear, single faces.")

@app.post("/recognize", response_model=RecognitionResult)
async def recognize_face(file: UploadFile = File(...)):
    """Recognize a face from uploaded image (legacy single-face endpoint)"""
    try:
        # Read image
        contents = await file.read()
        image_np = face_service.process_image_from_bytes(contents)

        # Detect faces to get bbox
        faces = face_service.detect_faces(image_np)
        bbox = faces[0]['bbox'] if faces else None

        # Create display bbox (tighter for better visuals)
        display_bbox = None
        if bbox:
            # Make display bbox tighter - reduce margins for clearer visuals
            x1, y1, x2, y2 = bbox
            width = x2 - x1
            height = y2 - y1

            # Reduce bbox by 15% on each side for tighter display
            margin_x = int(width * 0.15)
            margin_y = int(height * 0.15)

            display_x1 = max(0, x1 + margin_x)
            display_y1 = max(0, y1 + margin_y)
            display_x2 = x2 - margin_x
            display_y2 = y2 - margin_y

            # Ensure minimum size
            if display_x2 > display_x1 and display_y2 > display_y1:
                display_bbox = [display_x1, display_y1, display_x2, display_y2]

        print(f"DEBUG: Detected faces: {len(faces)}, bbox: {bbox}, display_bbox: {display_bbox}")  # Debug: bbox detection

        # Perform recognition (uses the embedding bbox)
        student_id, student_name, confidence = face_service.recognize_face(image_np)
        print(f"DEBUG: Recognition result - id: {student_id}, name: {student_name}, conf: {confidence}")  # Debug: recognition result

        if student_id is not None:
            # Check for duplicate attendance (5 minute cooldown)
            current_time = datetime.now()
            last_time = last_attendance_times.get(student_id)

            if last_time and (current_time - last_time).total_seconds() < 300:  # 5 minutes
                return RecognitionResult(
                    student_id=student_id,
                    student_name=student_name,
                    confidence=confidence,
                    recognized=True,
                    bbox=bbox,
                    display_bbox=display_bbox
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
                recognized=True,
                bbox=bbox,
                display_bbox=display_bbox
            )
        else:
            return RecognitionResult(
                confidence=confidence,
                recognized=False,
                bbox=bbox,
                display_bbox=display_bbox
            )

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Recognition failed: {str(e)}")

@app.post("/recognize/multi", response_model=MultiRecognitionResult)
async def recognize_faces_multi(file: UploadFile = File(...)):
    """Recognize multiple faces from uploaded image"""
    import time
    start_time = time.time()

    try:
        # Read image
        contents = await file.read()
        image_np = face_service.process_image_from_bytes(contents)

        # Detect all faces
        faces = face_service.detect_faces(image_np)
        total_faces = len(faces)

        results = []
        recognized_count = 0

        # Process each detected face
        for face in faces:
            bbox = face['bbox']

            # Extract embedding for this face
            embedding = face_service.extract_embedding(image_np, bbox)

            if embedding is None:
                results.append(RecognitionResult(
                    confidence=0.0,
                    recognized=False
                ))
                continue

            # Normalize embedding
            embedding = embedding / np.linalg.norm(embedding)

            # Compare with known faces
            best_match_id = None
            best_similarity = 0.0

            for student_id, known_embedding in face_service.known_faces.items():
                similarity = np.dot(embedding, known_embedding)
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_match_id = student_id

            # Check similarity threshold
            if best_similarity >= 0.6:  # Same threshold as single recognition
                student_name = face_service.face_names.get(best_match_id)

                # Check for duplicate attendance (5 minute cooldown)
                current_time = datetime.now()
                last_time = last_attendance_times.get(best_match_id)

                should_mark = True
                if last_time and (current_time - last_time).total_seconds() < 300:  # 5 minutes
                    should_mark = False

                if should_mark:
                    # Mark attendance
                    timestamp = current_time.isoformat()
                    attendance_record = AttendanceRecord(
                        student_id=best_match_id,
                        timestamp=timestamp,
                        confidence=best_similarity,
                        location="Webcam"
                    )
                    attendance_db.append(attendance_record.dict())
                    last_attendance_times[best_match_id] = current_time

                results.append(RecognitionResult(
                    student_id=best_match_id,
                    student_name=student_name,
                    confidence=best_similarity,
                    recognized=True,
                    bbox=bbox
                ))
                recognized_count += 1
            else:
                results.append(RecognitionResult(
                    confidence=best_similarity,
                    recognized=False,
                    bbox=bbox
                ))

        processing_time = time.time() - start_time

        return MultiRecognitionResult(
            results=results,
            total_faces=total_faces,
            recognized_count=recognized_count,
            processing_time=processing_time
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Multi-recognition failed: {str(e)}")

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
