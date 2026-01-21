from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import secrets
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import bcrypt
from models.user import User
from models.session import Session
from services.email import email_service
from services.database import get_db
import os

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "7"))

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class AuthService:
    def __init__(self):
        self.secret_key = SECRET_KEY
        self.algorithm = ALGORITHM
        self.access_token_expire = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        self.refresh_token_expire = timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a plain password against a hashed password"""
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

    def get_password_hash(self, password: str) -> str:
        """Hash a password"""
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

    def create_access_token(self, data: Dict[str, Any]) -> str:
        """Create JWT access token"""
        to_encode = data.copy()
        expire = datetime.utcnow() + self.access_token_expire
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
        return encoded_jwt

    def create_refresh_token(self, data: Dict[str, Any]) -> str:
        """Create JWT refresh token"""
        to_encode = data.copy()
        expire = datetime.utcnow() + self.refresh_token_expire
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
        return encoded_jwt

    async def authenticate_user(self, db: AsyncSession, email: str, password: str) -> Optional[User]:
        """Authenticate user with email and password"""
        try:
            result = await db.execute(
                select(User).where(User.email == email)
            )
            user = result.scalar_one_or_none()
            
            if not user or not self.verify_password(password, user.hashed_password):
                return None
            
            if not user.is_active:
                return None
                
            return user
        except Exception as e:
            print(f"Authentication error: {e}")
            return None

    async def get_user_by_email(self, db: AsyncSession, email: str) -> Optional[User]:
        """Get user by email"""
        try:
            result = await db.execute(
                select(User).where(User.email == email)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            print(f"Error getting user by email: {e}")
            return None

    async def get_user_by_id(self, db: AsyncSession, user_id: int) -> Optional[User]:
        """Get user by ID"""
        try:
            result = await db.execute(
                select(User).where(User.id == user_id)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            print(f"Error getting user by ID: {e}")
            return None

    async def create_user(self, db: AsyncSession, email: str, name: str, password: str, is_admin: bool = False) -> User:
        """Create a new user"""
        try:
            # Check if user already exists
            existing_user = await self.get_user_by_email(db, email)
            if existing_user:
                raise ValueError("Email already registered")
            
            # Create user (User model will hash the password)
            user = User(
                email=email,
                name=name,
                password=password,  # Pass raw password, User model will hash it
                is_admin=is_admin
            )
            
            # Generate email verification token
            verification_token = email_service.generate_token()
            user.email_verification_token = verification_token
            
            db.add(user)
            await db.commit()
            await db.refresh(user)
            
            # Send verification email
            await email_service.send_verification_email(email, verification_token)
            
            return user
        except Exception as e:
            await db.rollback()
            raise e

    async def verify_email(self, db: AsyncSession, token: str) -> bool:
        """Verify user email with token"""
        try:
            result = await db.execute(
                select(User).where(User.email_verification_token == token)
            )
            user = result.scalar_one_or_none()
            
            if not user:
                return False
            
            user.email_verified = True
            user.email_verification_token = None
            await db.commit()
            
            return True
        except Exception as e:
            await db.rollback()
            print(f"Email verification error: {e}")
            return False

    async def request_password_reset(self, db: AsyncSession, email: str) -> bool:
        """Request password reset by sending email"""
        try:
            user = await self.get_user_by_email(db, email)
            if not user:
                # Don't reveal if user exists or not
                return True
            
            # Generate reset token
            reset_token = email_service.generate_token()
            user.password_reset_token = reset_token
            user.password_reset_expires = datetime.utcnow() + timedelta(hours=1)
            
            await db.commit()
            
            # Send reset email
            await email_service.send_password_reset_email(email, reset_token)
            
            return True
        except Exception as e:
            await db.rollback()
            print(f"Password reset request error: {e}")
            return False

    async def reset_password(self, db: AsyncSession, token: str, new_password: str) -> bool:
        """Reset password with token"""
        try:
            result = await db.execute(
                select(User).where(User.password_reset_token == token)
            )
            user = result.scalar_one_or_none()
            
            if not user or user.password_reset_expires < datetime.utcnow():
                return False
            
            # Update password
            user.hashed_password = self.get_password_hash(new_password)
            user.password_reset_token = None
            user.password_reset_expires = None
            
            await db.commit()
            
            return True
        except Exception as e:
            await db.rollback()
            print(f"Password reset error: {e}")
            return False

    async def create_session(self, db: AsyncSession, user_id: int, token: str) -> Session:
        """Create a new session"""
        try:
            expires_at = datetime.utcnow() + self.refresh_token_expire
            
            session = Session(
                user_id=user_id,
                token=token,
                expires_at=expires_at
            )
            
            db.add(session)
            await db.commit()
            await db.refresh(session)
            
            return session
        except Exception as e:
            await db.rollback()
            raise e

    async def get_session(self, db: AsyncSession, token: str) -> Optional[Session]:
        """Get session by token"""
        try:
            result = await db.execute(
                select(Session).where(Session.token == token)
            )
            session = result.scalar_one_or_none()
            
            if session and session.is_expired():
                await db.delete(session)
                await db.commit()
                return None
            
            return session
        except Exception as e:
            print(f"Error getting session: {e}")
            return None

    async def delete_session(self, db: AsyncSession, token: str) -> bool:
        """Delete session by token"""
        try:
            session = await self.get_session(db, token)
            if session:
                await db.delete(session)
                await db.commit()
                return True
            return False
        except Exception as e:
            await db.rollback()
            print(f"Error deleting session: {e}")
            return False

# Global auth service instance
auth_service = AuthService()
