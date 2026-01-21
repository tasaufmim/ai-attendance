from PIL import Image
import io
from typing import List, Tuple, Optional, Dict
import os
import pickle

class FaceRecognitionService:
    """Simplified service - all AI processing now handled by face-api.js in browser"""

    def __init__(self):
        """Initialize the simplified face recognition service"""
        print("Face recognition service initialized (face-api.js mode)")

        # Face embeddings database (received from frontend)
        self.known_faces: Dict[int, List[float]] = {}
        self.face_names: Dict[int, str] = {}

        print("Service ready for face-api.js integration!")

    def register_face_from_embedding(self, student_id: int, student_name: str, embedding: List[float]) -> bool:
        """
        Register a student's face using embedding from face-api.js

        Args:
            student_id: Unique student identifier
            student_name: Student name
            embedding: Face embedding from face-api.js

        Returns:
            True if registration successful
        """
        try:
            # Store the embedding
            self.known_faces[student_id] = embedding
            self.face_names[student_id] = student_name

            print(f"Successfully registered student {student_name} (ID: {student_id})")
            return True
        except Exception as e:
            print(f"Registration failed: {e}")
            return False

    def recognize_face_from_embedding(self, embedding: List[float], threshold: float = 0.6) -> Tuple[Optional[int], Optional[str], float]:
        """
        Recognize a face using embedding from face-api.js

        Args:
            embedding: Face embedding from face-api.js
            threshold: Similarity threshold

        Returns:
            Tuple of (student_id, student_name, confidence)
        """
        try:
            best_match_id = None
            best_similarity = 0.0

            # Compare with known faces using Euclidean distance
            for student_id, known_embedding in self.known_faces.items():
                # Calculate Euclidean distance
                distance = sum((a - b) ** 2 for a, b in zip(embedding, known_embedding)) ** 0.5
                # Convert to similarity (higher = more similar)
                similarity = 1 / (1 + distance)

                if similarity > best_similarity:
                    best_similarity = similarity
                    best_match_id = student_id

            if best_similarity >= threshold:
                return best_match_id, self.face_names.get(best_match_id), best_similarity
            else:
                return None, None, best_similarity

        except Exception as e:
            print(f"Recognition failed: {e}")
            return None, None, 0.0

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

    def process_image_from_bytes(self, image_bytes: bytes) -> Image.Image:
        """Convert image bytes to PIL Image (for basic operations only)"""
        return Image.open(io.BytesIO(image_bytes))

# Global service instance
face_service = FaceRecognitionService()

def get_face_service() -> FaceRecognitionService:
    """Get the global face recognition service instance"""
    return face_service
