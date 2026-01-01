---
title: AI Attendance System API
emoji: 🤖
colorFrom: blue
colorTo: green
sdk: gradio
sdk_version: 4.44.1
app_file: app.py
pinned: false
license: mit
---

# AI Attendance System Backend

A FastAPI-based backend for AI-powered attendance tracking using face recognition.

## Features

- 🤖 **Face Recognition**: YOLO + InsightFace integration
- 📊 **Attendance Tracking**: Real-time student attendance marking
- 🔒 **Secure API**: CORS-enabled FastAPI endpoints
- 📱 **Mobile Friendly**: REST API for web/mobile clients

## API Endpoints

### Core Endpoints
- `GET /` - Health check
- `POST /students/` - Create student
- `POST /students/{id}/photos` - Upload student photos
- `POST /recognize` - Face recognition
- `GET /attendance/` - Get attendance records
- `GET /students/` - List all students

### Admin Endpoints
- `DELETE /students/{id}` - Remove student
- `DELETE /attendance/all` - Clear all attendance

## Quick Start

1. **Clone and setup**:
   ```bash
   git clone <your-repo>
   cd backend
   pip install -r requirements.txt
   ```

2. **Run locally**:
   ```bash
   python app.py
   ```

3. **API Documentation**: Visit `http://localhost:8000/docs`

## Deployment

This app is configured for Hugging Face Spaces with:
- **Framework**: FastAPI (custom)
- **Python**: 3.10+
- **Hardware**: CPU (free tier)
- **Scaling**: Automatic

## Configuration

### Environment Variables
- `PORT` - Server port (auto-assigned by Spaces)

### CORS Settings
Allows requests from:
- `http://localhost:3000` (development)
- `https://*.vercel.app` (production frontend)
- `https://*.hf.space` (Spaces domain)

## Architecture

```
backend/
├── app.py              # FastAPI application
├── requirements.txt    # Python dependencies
├── ai-service/         # Face recognition logic
│   └── face_recognition.py
└── README.md          # This file
```

## Dependencies

- **FastAPI** - Web framework
- **PyTorch** - ML framework (CPU optimized)
- **InsightFace** - Face recognition
- **OpenCV** - Computer vision
- **Uvicorn** - ASGI server

## License

MIT License - see LICENSE file for details.
