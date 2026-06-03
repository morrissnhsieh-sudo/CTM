from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PORT: int = 8001
    NODE_ENV: str = "development"
    LOG_LEVEL: str = "info"

    # Database
    DB_URL: str  # asyncpg format: postgresql+asyncpg://...
    DB_REPLICA_URL: str = ""  # AI workloads use read replica

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Kafka
    KAFKA_BROKERS: str = "localhost:9092"

    # ── LLM provider selection ────────────────────────────────
    # "vertex" (default) | "anthropic" | "openai"
    LLM_PROVIDER: str = "vertex"

    # Google Vertex AI (primary — service account JSON)
    GOOGLE_APPLICATION_CREDENTIALS: str = ""   # path to service account JSON
    VERTEX_PROJECT_ID: str = "d-sxd110x-ssd1-aaos"
    VERTEX_REGION: str = "us-central1"            # Vertex AI region for Claude
    # Gemini & Claude model IDs on Vertex AI
    VERTEX_MODEL_PRIMARY: str = "gemini-2.5-flash"
    VERTEX_MODEL_AGENT: str = "claude-3-opus@20240229"

    # Anthropic direct API (fallback / alternative)
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL_PRIMARY: str = "claude-3-5-sonnet-20241022"
    ANTHROPIC_MODEL_AGENT: str = "claude-3-opus-20240229"

    # OpenAI (second fallback)
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL_FALLBACK: str = "gpt-4o"

    # Embeddings
    EMBEDDING_MODEL: str = "text-embedding-004"  # Google Vertex embedding model
    EMBEDDING_DIM: int = 768                      # text-embedding-004 dim
    # Fallback: "text-embedding-3-small" (OpenAI, 1536 dim)

    # CTM API (for tool calls back to M3)
    CTM_API_URL: str = "http://api-service:3001"
    CTM_INTERNAL_TOKEN: str = ""

    # AI formula callback URL
    FORMULA_CALLBACK_URL: str = "http://api-service:3001/v1/ai/formula/callback"


settings = Settings()
