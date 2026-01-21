# AI Attendance System

A complete face recognition-based attendance tracking system with web interface.

## 🏗️ Architecture

- **Frontend**: Next.js 16 with React 19, TypeScript, Tailwind CSS
- **Backend**: FastAPI with Python, automatic API documentation
- **AI Service**: Browser-based face recognition using face-api.js
- **Database**: In-memory (easily replaceable with PostgreSQL/MySQL)

## 🚀 Quick Start

### Option 1: One-Command Startup (Recommended)
```bash
./start.sh
```
This will:
- Create Python virtual environment
- Install all dependencies
- Start both frontend (port 3000) and backend (port 8000)

### Option 2: Manual Setup

**1. Backend Setup**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python3 main.py
```

**2. Frontend Setup (in new terminal)**
```bash
cd frontend
npm install
npm run dev
```

## 🌐 Access Points

- **Main Application**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin
- **API Documentation**: http://localhost:8000/docs
- **API Base**: http://localhost:8000

## 📋 Features

### ✅ Working Features
- Real-time webcam face detection
- Student registration with photo upload
- Face recognition and attendance marking
- Admin panel for student management
- Attendance records viewing
- Responsive web interface

### 🔄 Current AI Mode
- **Mock AI Service**: Currently using simulated recognition for demo
- **Real AI Available**: Uncomment code in `backend/main.py` to activate

## 🛠️ Dependencies

### Backend (Python)
- fastapi: Web framework
- uvicorn: ASGI server
- pydantic: Data validation
- python-multipart: File uploads
- opencv-python: Computer vision
- insightface: Face recognition
- ultralytics: YOLO object detection
- torch: Machine learning framework
- pillow: Image processing

### Frontend (Node.js)
- next.js: React framework
- react-webcam: Webcam component
- tailwindcss: Styling
- lucide-react: Icons

## 🔧 Configuration

### Environment Variables
Create `.env` file in frontend directory:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Activating Real AI (Optional)
To use real face recognition instead of mock:

1. Ensure you have sufficient RAM (8GB+ recommended)
2. Uncomment lines 17-18 in `backend/main.py`:
```python
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'ai-service'))
from face_recognition import get_face_service
```
3. Replace `MockFaceService` with real service

## 📊 API Endpoints

- `GET /`: Health check
- `POST /students/`: Create student
- `POST /students/{id}/photos`: Upload student photos
- `GET /students/`: List all students
- `DELETE /students/{id}`: Delete student
- `POST /recognize`: Recognize face from image
- `GET /attendance/`: Get attendance records
- `DELETE /attendance/clear-all`: Clear all records

## 🎯 Usage

1. **Register Students**: Use admin panel to add students with photos
2. **Take Attendance**: Students look at webcam, faces are recognized automatically
3. **View Records**: Check attendance history in admin panel

## 🚀 Deployment

For production deployment, consider:
- **Frontend**: Vercel, Netlify, or any static hosting
- **Backend**: Railway, Render, Heroku, or AWS/GCP
- **Database**: Supabase, PlanetScale, or PostgreSQL

## 📝 Notes

- Current system uses in-memory storage (data resets on restart)
- AI models download automatically on first run
- System works with CPU-only, GPU optional for better performance
- CORS configured for local development and Vercel deployment

## 🐛 Troubleshooting

**Backend won't start:**
- Check if port 8000 is available
- Ensure Python 3.8+ is installed
- Try `pip install --upgrade pip` if installation fails

**Frontend won't connect:**
- Verify backend is running on port 8000
- Check CORS settings if deploying separately

**AI models fail to load:**
- Ensure stable internet connection (models download ~500MB)
- Check available disk space (need ~2GB free)

## 📄 License

This project is for educational and demonstration purposes.
