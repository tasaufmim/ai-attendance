import cv2
import numpy as np
import insightface
from ultralytics import YOLO
import torch
from PIL import Image
import io
from typing import List, Tuple, Optional, Dict
import os
import pickle

class FaceRecognitionService:
    def __init__(self):
        """Initialize the face recognition service with AI models"""
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        print(f"Using device: {self.device}")

        try:
            # Initialize face detector (YOLOv8)
            print("Loading YOLOv8 face detector...")
            self.face_detector = YOLO('yolov8n-face.pt')  # Will download automatically

            # Initialize face recognition model (ArcFace)
            print("Loading InsightFace ArcFace model...")
            self.face_recognizer = insightface.app.FaceAnalysis(
                name='buffalo_l',  # Use lightweight buffalo model
                root='./models',
                providers=['CPUExecutionProvider'] if not torch.cuda.is_available()
                         else ['CUDAExecutionProvider', 'CPUExecutionProvider']
            )
            self.face_recognizer.prepare(ctx_id=0, det_size=(640, 640))

            print("AI models loaded successfully!")
        except Exception as e:
            print(f"Warning: Failed to load AI models: {e}")
            print("Running in demo mode without AI models...")
            self.face_detector = None
            self.face_recognizer = None

        # Initialize anti-spoofing model (if available)
        self.anti_spoofing_model = None  # TODO: Add Silent-FaceNet later

        # Known faces database (embeddings)
        self.known_faces: Dict[int, np.ndarray] = {}
        self.face_names: Dict[int, str] = {}

        print("Face recognition service initialized successfully!")

    def detect_faces(self, image: np.ndarray) -> List[Dict]:
        """
        Detect faces in an image using YOLOv8

        Args:
            image: Input image as numpy array (BGR format)

        Returns:
            List of face dictionaries with bbox, confidence, etc.
        """
        if self.face_detector is None:
            # Demo mode: simulate face detection
            h, w = image.shape[:2]
            # Simulate detecting a face in the center
            faces = [{
                'bbox': [int(w*0.3), int(h*0.3), int(w*0.7), int(h*0.7)],
                'confidence': 0.95,
                'class': 0
            }]
            return faces

        results = self.face_detector(image, conf=0.5)

        faces = []
        for result in results:
            boxes = result.boxes
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                confidence = box.conf[0].cpu().numpy()

                faces.append({
                    'bbox': [int(x1), int(y1), int(x2), int(y2)],
                    'confidence': float(confidence),
                    'class': int(box.cls[0].cpu().numpy())
                })

        return faces

    def extract_embedding(self, image: np.ndarray, bbox: List[int]) -> Optional[np.ndarray]:
        """
        Extract face embedding from a detected face

        Args:
            image: Input image as numpy array (BGR format)
            bbox: Face bounding box [x1, y1, x2, y2]

        Returns:
            Face embedding vector (512D) or None if extraction fails
        """
        if self.face_recognizer is None:
            # Demo mode: generate a mock embedding
            return np.random.rand(512).astype(np.float32)

        try:
            # Crop face from image
            x1, y1, x2, y2 = bbox
            face_crop = image[y1:y2, x1:x2]

            if face_crop.size == 0:
                return None

            # Convert to RGB for InsightFace
            face_rgb = cv2.cvtColor(face_crop, cv2.COLOR_BGR2RGB)

            # Get face features
            faces = self.face_recognizer.get(face_rgb)

            if len(faces) > 0:
                # Return the first face's embedding
                return faces[0].embedding
            else:
                return None

        except Exception as e:
            print(f"Error extracting embedding: {e}")
            return None

    def register_face(self, student_id: int, student_name: str, face_images: List[np.ndarray]) -> bool:
        """
        Register a student's face by computing average embedding from multiple photos

        Args:
            student_id: Unique student identifier
            student_name: Student name
            face_images: List of face images (numpy arrays)

        Returns:
            True if registration successful, False otherwise
        """
        embeddings = []

        for image in face_images:
            # Detect faces
            faces = self.detect_faces(image)

            if len(faces) == 1:
                # Extract embedding
                embedding = self.extract_embedding(image, faces[0]['bbox'])
                if embedding is not None:
                    embeddings.append(embedding)
            elif len(faces) > 1:
                print(f"Multiple faces detected in image for student {student_id}, skipping")
                continue
            else:
                print(f"No faces detected in image for student {student_id}, skipping")
                continue

        if len(embeddings) >= 3:  # Require at least 3 good photos
            # Compute average embedding
            avg_embedding = np.mean(embeddings, axis=0)
            avg_embedding = avg_embedding / np.linalg.norm(avg_embedding)  # L2 normalize

            # Store in database
            self.known_faces[student_id] = avg_embedding
            self.face_names[student_id] = student_name

            print(f"Successfully registered student {student_name} (ID: {student_id}) with {len(embeddings)} photos")
            return True
        else:
            print(f"Insufficient good photos for student {student_id}. Got {len(embeddings)}, need at least 3.")
            return False

    def recognize_face(self, image: np.ndarray, threshold: float = 0.6) -> Tuple[Optional[int], Optional[str], float]:
        """
        Recognize a face in an image

        Args:
            image: Input image as numpy array (BGR format)
            threshold: Similarity threshold for recognition

        Returns:
            Tuple of (student_id, student_name, confidence) or (None, None, confidence) if not recognized
        """
        # Detect faces
        faces = self.detect_faces(image)

        if len(faces) != 1:
            return None, None, 0.0

        # Extract embedding
        embedding = self.extract_embedding(image, faces[0]['bbox'])

        if embedding is None:
            return None, None, 0.0

        # Normalize embedding
        embedding = embedding / np.linalg.norm(embedding)

        # Compare with known faces
        best_match_id = None
        best_similarity = 0.0

        for student_id, known_embedding in self.known_faces.items():
            similarity = np.dot(embedding, known_embedding)  # Cosine similarity
            if similarity > best_similarity:
                best_similarity = similarity
                best_match_id = student_id

        if best_similarity >= threshold:
            return best_match_id, self.face_names.get(best_match_id), best_similarity
        else:
            return None, None, best_similarity

    def save_database(self, filepath: str = 'face_database.pkl'):
        """Save the face database to disk"""
        data = {
            'known_faces': self.known_faces,
            'face_names': self.face_names
        }
        with open(filepath, 'wb') as f:
            pickle.dump(data, f)
        print(f"Face database saved to {filepath}")

    def load_database(self, filepath: str = 'face_database.pkl'):
        """Load the face database from disk"""
        if os.path.exists(filepath):
            with open(filepath, 'rb') as f:
                data = pickle.load(f)
            self.known_faces = data.get('known_faces', {})
            self.face_names = data.get('face_names', {})
            print(f"Loaded {len(self.known_faces)} faces from database")
        else:
            print(f"Database file {filepath} not found")

    def process_image_from_bytes(self, image_bytes: bytes) -> np.ndarray:
        """Convert image bytes to numpy array"""
        image = Image.open(io.BytesIO(image_bytes))
        return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

    def is_live_face(self, image: np.ndarray, bbox: List[int]) -> bool:
        """
        Check if face is live (anti-spoofing)
        TODO: Implement with Silent-FaceNet or similar
        """
        # For now, always return True
        return True

# Global service instance
face_service = FaceRecognitionService()

def get_face_service() -> FaceRecognitionService:
    """Get the global face recognition service instance"""
    return face_service
