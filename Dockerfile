# Railway-optimized Dockerfile for AI Attendance Backend
# Uses multi-stage build for faster deployments and smaller images

# Build stage - install dependencies
FROM python:3.11-slim as builder

# Install system dependencies for AI/ML libraries
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgthread-2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set work directory
WORKDIR /app

# Copy requirements first for better caching
COPY backend/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --user -r requirements.txt

# Production stage - copy only necessary files
FROM python:3.11-slim

# Install runtime system dependencies
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgthread-2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Create app user for security
RUN useradd --create-home --shell /bin/bash app

# Set work directory
WORKDIR /app

# Copy installed dependencies from builder stage
COPY --from=builder /root/.local /home/app/.local

# Copy backend application code
COPY backend/ .

# Copy AI service
COPY ai-service/ ./ai-service/

# Change ownership to app user
RUN chown -R app:app /app
USER app

# Add user local bin to PATH
ENV PATH=/home/app/.local/bin:$PATH

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/', timeout=10)" || exit 1

# Start the application
CMD ["python", "main.py"]
