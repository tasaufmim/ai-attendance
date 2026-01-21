from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, timedelta
import os

from services.auth import auth_service
from services.database import get_db
from models.user import User

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

class FaceRegistrationRequest(BaseModel):
    face_embeddings: List[float]

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict

class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    is_active: bool
    is_admin: bool
    email_verified: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

@router.post("/register", response_model=UserResponse)
async def register_user(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """Register a new user"""
    try:
        user = await auth_service.create_user(
            db=db,
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
async def login_user(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """Login user and return JWT tokens"""
    try:
        user = await auth_service.authenticate_user(
            db=db,
            email=request.email,
            password=request.password
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
        await auth_service.create_session(db, user.id, refresh_token)
        
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
async def logout_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
):
    """Logout user by invalidating refresh token"""
    try:
        token = credentials.credentials
        success = await auth_service.delete_session(db, token)
        
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
async def refresh_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
):
    """Refresh access token using refresh token"""
    try:
        refresh_token = credentials.credentials
        session = await auth_service.get_session(db, refresh_token)
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        # Get user
        user = await auth_service.get_user_by_id(db, session.user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Create new tokens
        access_token = auth_service.create_access_token({"sub": user.email, "user_id": user.id})
        new_refresh_token = auth_service.create_refresh_token({"sub": user.email, "user_id": user.id})
        
        # Update session
        await auth_service.delete_session(db, refresh_token)
        await auth_service.create_session(db, user.id, new_refresh_token)
        
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
async def verify_email(
    request: VerifyEmailRequest,
    db: AsyncSession = Depends(get_db)
):
    """Verify user email with token"""
    try:
        success = await auth_service.verify_email(db, request.token)
        
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
async def forgot_password(
    request: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    """Request password reset"""
    try:
        success = await auth_service.request_password_reset(db, request.email)
        
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
async def reset_password(
    request: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    """Reset password with token"""
    try:
        success = await auth_service.reset_password(db, request.token, request.new_password)
        
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

@router.get("/me", response_model=UserResponse)
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
):
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
        
        user = await auth_service.get_user_by_id(db, user_id)
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
async def resend_verification(
    request: ForgotPasswordRequest,  # Reusing the same structure
    db: AsyncSession = Depends(get_db)
):
    """Resend email verification"""
    try:
        user = await auth_service.get_user_by_email(db, request.email)
        if not user:
            # Don't reveal if user exists or not
            return {"message": "Verification email sent"}
        
        if user.email_verified:
            return {"message": "Email already verified"}
        
        # Generate new verification token
        verification_token = auth_service.email_service.generate_token()
        user.email_verification_token = verification_token
        await db.commit()
        
        # Send verification email
        await auth_service.email_service.send_verification_email(request.email, verification_token)
        
        return {"message": "Verification email sent"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to resend verification email"
        )

@router.post("/face/register")
async def register_face(
    request: FaceRegistrationRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
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

        user = await auth_service.get_user_by_id(db, user_id)
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
        user.face_embeddings = request.face_embeddings
        user.face_registered = True
        user.face_registered_at = datetime.utcnow()
        await db.commit()

        return {
            "success": True,
            "message": "Face registered successfully",
            "user": {
                "id": user.id,
                "email": user.email,
                "face_registered": user.face_registered,
                "face_registered_at": user.face_registered_at
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
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
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

        user = await auth_service.get_user_by_id(db, user_id)
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
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
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

        user = await auth_service.get_user_by_id(db, user_id)
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
