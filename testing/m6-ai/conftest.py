"""
Pytest conftest — sets required environment variables before any test module
imports src.config (which instantiates Settings on load).
"""
import os

# Set all required env vars before imports
os.environ.setdefault("DB_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("KAFKA_BROKERS", "localhost:9092")
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-test-key")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "")
os.environ.setdefault("VERTEX_PROJECT_ID", "test-project")
os.environ.setdefault("CTM_API_URL", "http://localhost:3001")
os.environ.setdefault("FORMULA_CALLBACK_URL", "http://localhost:3001/v1/ai/formula/callback")
