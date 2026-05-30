"""Database connection management for the AI service."""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from .config import settings

engine = create_async_engine(
    settings.DB_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    """Initialize database connection pool."""
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: None)  # warm up pool


async def close_db():
    await engine.dispose()


async def get_session() -> AsyncSession:
    async with async_session_factory() as session:
        yield session
