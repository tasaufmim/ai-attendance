from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import secrets
from jose import JWTError, jwt
from passlib.context import CryptContext
import bcrypt
from ..models.user import User
from ..models.session import Session
from services.email import email_service
from services.database import get_database, USERS_COLLECTION, SESSIONS_COLLECTION
from pymongo.errors import DuplicateKeyError
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

    async def authenticate_user(self, email: str, password: str) -> Optional[User]:
        """Authenticate user with email and password"""
        try:
            db = get_database()
            user_doc = await db[USERS_COLLECTION].find_one({"email": email})

            if not user_doc:
                return None

            user = User.from_dict(user_doc)

            if not user.hashed_password or not self.verify_password(password, user.hashed_password):
                return None

            if not user.is_active:
                return None

            return user
        except Exception as e:
            print(f"Authentication error: {e}")
            return None

    async def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email"""
        try:
            db = get_database()
            user_doc = await db[USERS_COLLECTION].find_one({"email": email})
            if user_doc:
                return User.from_dict(user_doc)
            return None
        except Exception as e:
            print(f"Error getting user by email: {e}")
            return None

    async def get_user_by_id(self, user_id: str) -> Optional[User]:
        """Get user by ID"""
        try:
            db = get_database()
            user_doc = await db[USERS_COLLECTION].find_one({"_id": user_id})
            if user_doc:
                return User.from_dict(user_doc)
            return None
        except Exception as e:
            print(f"Error getting user by ID: {e}")
            return None

    async def create_user(self, email: str, name: str, password: str = None, is_admin: bool = False, provider: str = None, provider_id: str = None, provider_data: dict = None) -> User:
        """Create a new user"""
        try:
            db = get_database()

            # Check if user already exists
            existing_user = await self.get_user_by_email(email)
            if existing_user:
                raise ValueError("Email already registered")

            # Create user (User model will hash the password if provided)
            user = User(
                email=email,
                name=name,
                hashed_password=User.hash_password(password) if password else None,
                is_admin=is_admin,
                provider=provider,
                provider_id=provider_id,
                provider_data=provider_data
            )

            # Generate email verification token for password-based users
            if password and not provider:
                verification_token = email_service.generate_token()
                user.email_verification_token = verification_token
                # Send verification email
                await email_service.send_verification_email(email, verification_token)
            elif provider:
                # OAuth users are automatically verified
                user.email_verified = True

            # Insert into database
            user_dict = user.dict(by_alias=True)
            result = await db[USERS_COLLECTION].insert_one(user_dict)
            user.id = str(result.inserted_id)

            return user
        except DuplicateKeyError:
            raise ValueError("Email already registered")
        except Exception as e:
            print(f"User creation error: {e}")
            raise e

    async def verify_email(self, token: str) -> bool:
        """Verify user email with token"""
        try:
            db = get_database()
            user_doc = await db[USERS_COLLECTION].find_one({"email_verification_token": token})

            if not user_doc:
                return False

            # Update user
            await db[USERS_COLLECTION].update_one(
                {"_id": user_doc["_id"]},
                {
                    "$set": {
                        "email_verified": True,
                        "email_verification_token": None,
                        "updated_at": datetime.utcnow()
                    }
                }
            )

            return True
        except Exception as e:
            print(f"Email verification error: {e}")
            return False

    async def request_password_reset(self, email: str) -> bool:
        """Request password reset by sending email"""
        try:
            user = await self.get_user_by_email(email)
            if not user:
                # Don't reveal if user exists or not
                return True

            # Generate reset token
            reset_token = email_service.generate_token()
            expires_at = datetime.utcnow() + timedelta(hours=1)

            db = get_database()
            await db[USERS_COLLECTION].update_one(
                {"_id": user.id},
                {
                    "$set": {
                        "password_reset_token": reset_token,
                        "password_reset_expires": expires_at,
                        "updated_at": datetime.utcnow()
                    }
                }
            )

            # Send reset email
            await email_service.send_password_reset_email(email, reset_token)

            return True
        except Exception as e:
            print(f"Password reset request error: {e}")
            return False

    async def reset_password(self, token: str, new_password: str) -> bool:
        """Reset password with token"""
        try:
            db = get_database()
            user_doc = await db[USERS_COLLECTION].find_one({
                "password_reset_token": token,
                "password_reset_expires": {"$gt": datetime.utcnow()}
            })

            if not user_doc:
                return False

            # Update password
            hashed_password = self.get_password_hash(new_password)
            await db[USERS_COLLECTION].update_one(
                {"_id": user_doc["_id"]},
                {
                    "$set": {
                        "hashed_password": hashed_password,
                        "password_reset_token": None,
                        "password_reset_expires": None,
                        "updated_at": datetime.utcnow()
                    }
                }
            )

            return True
        except Exception as e:
            print(f"Password reset error: {e}")
            return False

    async def create_session(self, user_id: str, token: str) -> Session:
        """Create a new session"""
        try:
            db = get_database()
            expires_at = datetime.utcnow() + self.refresh_token_expire

            session = Session(
                user_id=user_id,
                token=token,
                expires_at=expires_at
            )

            # Insert into database
            session_dict = session.dict(by_alias=True)
            result = await db[SESSIONS_COLLECTION].insert_one(session_dict)
            session.id = str(result.inserted_id)

            return session
        except Exception as e:
            print(f"Session creation error: {e}")
            raise e

    async def get_session(self, token: str) -> Optional[Session]:
        """Get session by token"""
        try:
            db = get_database()
            session_doc = await db[SESSIONS_COLLECTION].find_one({"token": token})

            if not session_doc:
                return None

            session = Session.from_dict(session_doc)

            if session.is_expired():
                await db[SESSIONS_COLLECTION].delete_one({"_id": session.id})
                return None

            return session
        except Exception as e:
            print(f"Error getting session: {e}")
            return None

    async def delete_session(self, token: str) -> bool:
        """Delete session by token"""
        try:
            db = get_database()
            result = await db[SESSIONS_COLLECTION].delete_one({"token": token})
            return result.deleted_count > 0
        except Exception as e:
            print(f"Error deleting session: {e}")
            return False

    async def get_or_create_oauth_user(self, provider: str, provider_id: str, email: str, name: str, provider_data: dict = None) -> User:
        """Get or create user from OAuth provider"""
        try:
            db = get_database()

            # Try to find existing user by provider and provider_id
            user_doc = await db[USERS_COLLECTION].find_one({
                "provider": provider,
                "provider_id": provider_id
            })

            if user_doc:
                user = User.from_dict(user_doc)
                # Update user data if needed
                if provider_data:
                    await db[USERS_COLLECTION].update_one(
                        {"_id": user.id},
                        {
                            "$set": {
                                "provider_data": provider_data,
                                "updated_at": datetime.utcnow()
                            }
                        }
                    )
                    user.provider_data = provider_data
                return user

            # Check if email already exists with different provider
            existing_email_user = await self.get_user_by_email(email)
            if existing_email_user:
                # Link OAuth account to existing user
                await db[USERS_COLLECTION].update_one(
                    {"_id": existing_email_user.id},
                    {
                        "$set": {
                            "provider": provider,
                            "provider_id": provider_id,
                            "provider_data": provider_data,
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
                existing_email_user.provider = provider
                existing_email_user.provider_id = provider_id
                existing_email_user.provider_data = provider_data
                return existing_email_user

            # Create new OAuth user
            user = await self.create_user(
                email=email,
                name=name,
                password=None,  # OAuth users don't have passwords
                provider=provider,
                provider_id=provider_id,
                provider_data=provider_data
            )

            return user
        except Exception as e:
            print(f"OAuth user creation error: {e}")
            raise e

    async def authenticate_oauth_user(self, provider: str, provider_id: str) -> Optional[User]:
        """Authenticate OAuth user"""
        try:
            db = get_database()
            user_doc = await db[USERS_COLLECTION].find_one({
                "provider": provider,
                "provider_id": provider_id
            })

            if user_doc:
                user = User.from_dict(user_doc)
                if user.is_active:
                    return user
            return None
        except Exception as e:
            print(f"OAuth authentication error: {e}")
            return None

# Global auth service instance
auth_service = AuthService()
