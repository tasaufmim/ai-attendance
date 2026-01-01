#!/bin/bash

# Google Cloud Run Deployment Script for AI Attendance Backend
# Run this script from the backend directory

set -e

# Configuration
PROJECT_ID="${PROJECT_ID:-your-gcp-project-id}"
SERVICE_NAME="ai-attendance-backend"
REGION="${REGION:-us-central1}"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🚀 Deploying AI Attendance Backend to Google Cloud Run"
echo "Project ID: ${PROJECT_ID}"
echo "Service: ${SERVICE_NAME}"
echo "Region: ${REGION}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n 1 > /dev/null; then
    echo "❌ Not authenticated with Google Cloud. Run: gcloud auth login"
    exit 1
fi

# Set project
echo "🔧 Setting project to ${PROJECT_ID}"
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo "🔧 Enabling required APIs..."
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Build and push Docker image
echo "🏗️ Building and pushing Docker image..."
gcloud builds submit --tag ${IMAGE_NAME} .

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
    --image ${IMAGE_NAME} \
    --platform managed \
    --region ${REGION} \
    --allow-unauthenticated \
    --port 8080 \
    --memory 2Gi \
    --cpu 1 \
    --max-instances 10 \
    --concurrency 80 \
    --timeout 300

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region=${REGION} --format="value(status.url)")

echo "✅ Deployment successful!"
echo "🌐 Service URL: ${SERVICE_URL}"
echo "📚 API Documentation: ${SERVICE_URL}/docs"
echo "🏥 Health Check: ${SERVICE_URL}/"

echo ""
echo "📋 Next steps:"
echo "1. Update your Vercel environment variable:"
echo "   NEXT_PUBLIC_API_URL=${SERVICE_URL}"
echo "2. Test the API endpoints"
echo "3. Your frontend should now work with the backend!"
