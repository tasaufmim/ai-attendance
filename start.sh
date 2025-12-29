#!/bin/bash

# AI Attendance System Startup Script
# This script starts both the frontend and backend services

echo "🚀 Starting AI Attendance System..."

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null; then
        echo "❌ Port $1 is already in use. Please stop the service using that port or change the port."
        exit 1
    fi
}

# Check if ports are available
check_port 3000
check_port 8000

# Start backend in background
echo "🔧 Starting backend server on port 8000..."
cd backend
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt

echo "⚡ Starting FastAPI server..."
python3 main.py &
BACKEND_PID=$!

cd ..

# Wait a bit for backend to start
sleep 3

# Start frontend in background
echo "🎨 Starting frontend server on port 3000..."
cd frontend
npm install
echo "⚡ Starting Next.js server..."
npm run dev &
FRONTEND_PID=$!

cd ..

echo ""
echo "✅ Services started successfully!"
echo "🌐 Frontend: http://localhost:3000"
echo "🔧 Backend API: http://localhost:8000"
echo "📚 API Documentation: http://localhost:8000/docs"
echo ""
echo "📝 To stop services, press Ctrl+C"

# Wait for user interrupt
trap "echo '🛑 Stopping services...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
