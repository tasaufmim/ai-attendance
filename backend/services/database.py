import motor.motor_asyncio
import os
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
import secrets
from pymongo.errors import DuplicateKeyError

# MongoDB configuration
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb+srv://mail2tasauf_db_user:3KEffIIXfAdM4bsi@cluster.mongodb.net/ai_attendance?retryWrites=true&w=majority")
DATABASE_NAME = os.getenv("DATABASE_NAME", "ai_attendance")

# Global MongoDB client
client: Optional[motor.motor_asyncio.AsyncIOMotorClient] = None
database = None

async def init_db():
    """Initialize MongoDB connection"""
    global client, database
    try:
        # Try connecting to MongoDB Atlas with proper SSL configuration
        import certifi
        import ssl

        client = motor.motor_asyncio.AsyncIOMotorClient(
            MONGODB_URL,
            tls=True,
            tlsCAFile=certifi.where(),
            tlsAllowInvalidCertificates=False,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=5000
        )
        database = client[DATABASE_NAME]

        # Test connection
        await client.admin.command('ping')
        print("✅ Connected to MongoDB Atlas successfully")

        # Create indexes
        await database.users.create_index("email", unique=True)
        await database.users.create_index("provider_id", sparse=True)
        await database.sessions.create_index("token", unique=True)
        await database.sessions.create_index("expires_at", expireAfterSeconds=0)

        print("✅ Database indexes created")

    except Exception as e:
        print(f"❌ Failed to connect to MongoDB: {e}")
        print("🔄 Falling back to local MongoDB for development...")
        try:
            # Fallback to local MongoDB if Atlas fails
            local_url = "mongodb://localhost:27017"
            client = motor.motor_asyncio.AsyncIOMotorClient(local_url)
            database = client[DATABASE_NAME]

            # Test local connection
            await client.admin.command('ping')
            print("✅ Connected to local MongoDB successfully")

            # Create indexes
            await database.users.create_index("email", unique=True)
            await database.users.create_index("provider_id", sparse=True)
            await database.sessions.create_index("token", unique=True)
            await database.sessions.create_index("expires_at", expireAfterSeconds=0)

            print("✅ Database indexes created")

        except Exception as local_error:
            print(f"❌ Failed to connect to local MongoDB: {local_error}")
            print("⚠️  Starting backend without database connection for API testing...")
            # Create a mock database object to allow the app to start
            class MockDatabase:
                def __getitem__(self, name):
                    return MockCollection()

            class MockCollection:
                async def create_index(self, *args, **kwargs):
                    pass

            database = MockDatabase()
            print("⚠️  Backend started in limited mode - database operations will fail")

async def close_db():
    """Close MongoDB connection"""
    global client
    if client:
        client.close()

def get_database():
    """Get database instance"""
    return database

# Collection names
USERS_COLLECTION = "users"
SESSIONS_COLLECTION = "sessions"
