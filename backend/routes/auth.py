from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
import os

from ..services.auth import auth_service
from ..services.email import email_service

router = APIRouter()
security = HTTPBearer()

class RegisterRequest(BaseModel):
    email: EmailStr
    name: str
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class VerifyEmailRequest(BaseModel):
    token: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class OAuthCallbackRequest(BaseModel):
    provider: str  # 'google'
    provider_id: str
    email: EmailStr
    name: str
    provider_data: Optional[dict] = None

class FaceRegistrationRequest(BaseModel):
    face_embeddings: List[float]

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    is_active: bool
    is_admin: bool
    email_verified: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

@router.post("/register", response_model=UserResponse)
async def register_user(request: RegisterRequest):
    """Register a new user"""
    try:
        user = await auth_service.create_user(
            email=request.email,
            name=request.name,
            password=request.password
        )
        return user.to_dict()
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed"
        )

@router.post("/login", response_model=TokenResponse)
async def login_user(request: LoginRequest):
    """Login user and return JWT tokens"""
    try:
        user = await auth_service.authenticate_user(
            request.email,
            request.password
        )

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        # Create tokens
        access_token = auth_service.create_access_token({"sub": user.email, "user_id": user.id})
        refresh_token = auth_service.create_refresh_token({"sub": user.email, "user_id": user.id})

        # Create session
        await auth_service.create_session(user.id, refresh_token)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": 1800,  # 30 minutes
            "user": user.to_dict()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed"
        )

@router.post("/logout")
async def logout_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Logout user by invalidating refresh token"""
    try:
        token = credentials.credentials
        success = await auth_service.delete_session(token)

        if success:
            return {"message": "Successfully logged out"}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid token"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Logout failed"
        )

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Refresh access token using refresh token"""
    try:
        refresh_token = credentials.credentials
        session = await auth_service.get_session(refresh_token)

        if not session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )

        # Get user
        user = await auth_service.get_user_by_id(session.user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Create new tokens
        access_token = auth_service.create_access_token({"sub": user.email, "user_id": user.id})
        new_refresh_token = auth_service.create_refresh_token({"sub": user.email, "user_id": user.id})

        # Update session
        await auth_service.delete_session(refresh_token)
        await auth_service.create_session(user.id, new_refresh_token)

        return {
            "access_token": access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
            "expires_in": 1800,  # 30 minutes
            "user": user.to_dict()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token refresh failed"
        )

@router.post("/verify-email")
async def verify_email(request: VerifyEmailRequest):
    """Verify user email with token"""
    try:
        success = await auth_service.verify_email(request.token)

        if success:
            return {"message": "Email verified successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification token"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Email verification failed"
        )

@router.post("/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    """Request password reset"""
    try:
        success = await auth_service.request_password_reset(request.email)

        if success:
            return {"message": "Password reset email sent"}
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to process password reset request"
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Password reset request failed"
        )

@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest):
    """Reset password with token"""
    try:
        success = await auth_service.reset_password(request.token, request.new_password)

        if success:
            return {"message": "Password reset successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Password reset failed"
        )

@router.post("/oauth/callback", response_model=TokenResponse)
async def oauth_callback(request: OAuthCallbackRequest):
    """Handle OAuth callback and create/login user"""
    try:
        # Get or create OAuth user
        user = await auth_service.get_or_create_oauth_user(
            provider=request.provider,
            provider_id=request.provider_id,
            email=request.email,
            name=request.name,
            provider_data=request.provider_data
        )

        # Create tokens
        access_token = auth_service.create_access_token({"sub": user.email, "user_id": user.id})
        refresh_token = auth_service.create_refresh_token({"sub": user.email, "user_id": user.id})

        # Create session
        await auth_service.create_session(user.id, refresh_token)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": 1800,  # 30 minutes
            "user": user.to_dict()
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OAuth authentication failed"
        )

@router.get("/me", response_model=UserResponse)
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current user information"""
    try:
        from jose import jwt, JWTError

        token = credentials.credentials
        payload = jwt.decode(token, auth_service.secret_key, algorithms=[auth_service.algorithm])
        user_id = payload.get("user_id")

        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )

        user = await auth_service.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        return user.to_dict()
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get user information"
        )

@router.post("/resend-verification")
async def resend_verification(request: ForgotPasswordRequest):
    """Resend email verification"""
    try:
        user = await auth_service.get_user_by_email(request.email)
        if not user:
            # Don't reveal if user exists or not
            return {"message": "Verification email sent"}

        if user.email_verified:
            return {"message": "Email already verified"}

        # Generate new verification token
        verification_token = email_service.generate_token()
        user.email_verification_token = verification_token

        # Update user in database
        from services.database import get_database, USERS_COLLECTION
        db = get_database()
        await db[USERS_COLLECTION].update_one(
            {"_id": user.id},
            {
                "$set": {
                    "email_verification_token": verification_token,
                    "updated_at": datetime.utcnow()
                }
            }
        )

        # Send verification email
        await email_service.send_verification_email(request.email, verification_token)

        return {"message": "Verification email sent"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to resend verification email"
        )

@router.post("/face/register")
async def register_face(
    request: FaceRegistrationRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Register face embeddings for the current user"""
    try:
        from jose import jwt, JWTError

        token = credentials.credentials
        payload = jwt.decode(token, auth_service.secret_key, algorithms=[auth_service.algorithm])
        user_id = payload.get("user_id")

        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )

        user = await auth_service.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Validate embeddings
        if not request.face_embeddings or len(request.face_embeddings) != 128:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid face embeddings. Must be an array of 128 floats."
            )

        # Update user with face embeddings
        from services.database import get_database, USERS_COLLECTION
        db = get_database()
        await db[USERS_COLLECTION].update_one(
            {"_id": user.id},
            {
                "$set": {
                    "face_embeddings": request.face_embeddings,
                    "face_registered": True,
                    "face_registered_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
            }
        )

        return {
            "success": True,
            "message": "Face registered successfully",
            "user": {
                "id": user.id,
                "email": user.email,
                "face_registered": True,
                "face_registered_at": datetime.utcnow()
            }
        }
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to register face"
        )

@router.get("/face/status")
async def get_face_registration_status(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Get face registration status for the current user"""
    try:
        from jose import jwt, JWTError

        token = credentials.credentials
        payload = jwt.decode(token, auth_service.secret_key, algorithms=[auth_service.algorithm])
        user_id = payload.get("user_id")

        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )

        user = await auth_service.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        return {
            "face_registered": user.face_registered,
            "face_registered_at": user.face_registered_at
        }
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get face registration status"
        )

@router.post("/face/verify")
async def verify_face(
    request: FaceRegistrationRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Verify face against stored embeddings"""
    try:
        from jose import jwt, JWTError

        token = credentials.credentials
        payload = jwt.decode(token, auth_service.secret_key, algorithms=[auth_service.algorithm])
        user_id = payload.get("user_id")

        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )

        user = await auth_service.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        if not user.face_registered or not user.face_embeddings:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Face not registered for this user"
            )

        # Validate input embeddings
        if not request.face_embeddings or len(request.face_embeddings) != 128:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid face embeddings. Must be an array of 128 floats."
            )

        # Calculate Euclidean distance
        stored_embeddings = user.face_embeddings
        distance = sum((a - b) ** 2 for a, b in zip(stored_embeddings, request.face_embeddings)) ** 0.5

        # Face recognition threshold
        threshold = 0.6
        is_match = distance < threshold
        confidence = max(0, min(1, 1 - (distance / 1.0)))

        return {
            "verified": is_match,
            "confidence": confidence,
            "distance": distance,
            "threshold": threshold
        }
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify face"
        )
