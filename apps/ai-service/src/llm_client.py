"""
LLM client factory — resolves the correct Anthropic client based on LLM_PROVIDER.

Priority:
  1. Vertex AI   (GOOGLE_APPLICATION_CREDENTIALS set)  → AnthropicVertex
  2. Anthropic   (ANTHROPIC_API_KEY set)               → Anthropic
  3. OpenAI      (OPENAI_API_KEY set)                  → OpenAI (fallback)

All callers should use `get_client()` / `get_sync_client()` so the provider
can be swapped by config without touching route code.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Union

import structlog

from .config import settings

log = structlog.get_logger()

# Type aliases
AnthropicClientType = Union[
    "anthropic.AsyncAnthropic",
    "anthropic.AsyncAnthropicVertex",
]


@lru_cache(maxsize=1)
def _load_vertex_credentials() -> tuple[str, str] | None:
    """
    Load Vertex AI credentials from the service account JSON file.
    Returns (project_id, region) if valid, else None.
    """
    creds_path = settings.GOOGLE_APPLICATION_CREDENTIALS
    if not creds_path or not os.path.isfile(creds_path):
        return None

    try:
        with open(creds_path) as f:
            sa = json.load(f)
        project_id = sa.get("project_id") or settings.VERTEX_PROJECT_ID
        log.info(
            "Vertex AI credentials loaded",
            project=project_id,
            client_email=sa.get("client_email", ""),
        )
        return project_id, settings.VERTEX_REGION
    except Exception as e:
        log.error("Failed to load Vertex AI credentials", path=creds_path, error=str(e))
        return None


def get_async_client() -> AnthropicClientType:
    """
    Return an async Anthropic client for the configured LLM provider.
    """
    provider = settings.LLM_PROVIDER.lower()

    # ── Vertex AI ──────────────────────────────────────────────
    if provider == "vertex" or settings.GOOGLE_APPLICATION_CREDENTIALS:
        creds = _load_vertex_credentials()
        if creds:
            project_id, region = creds
            # Set GOOGLE_APPLICATION_CREDENTIALS env var so google-auth picks it up
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = settings.GOOGLE_APPLICATION_CREDENTIALS
            import anthropic
            client = anthropic.AsyncAnthropicVertex(
                project_id=project_id,
                region=region,
            )
            log.info("Using AnthropicVertex client", project=project_id, region=region)
            return client

    # ── Direct Anthropic ───────────────────────────────────────
    if settings.ANTHROPIC_API_KEY:
        import anthropic
        log.info("Using Anthropic direct client")
        return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    raise RuntimeError(
        "No LLM credentials configured. "
        "Set GOOGLE_APPLICATION_CREDENTIALS (Vertex AI) or ANTHROPIC_API_KEY."
    )


def get_primary_model() -> str:
    """Return the primary model ID for the active provider."""
    if settings.GOOGLE_APPLICATION_CREDENTIALS and _load_vertex_credentials():
        return settings.VERTEX_MODEL_PRIMARY
    return settings.ANTHROPIC_MODEL_PRIMARY


def get_agent_model() -> str:
    """Return the heavier agent model ID for the active provider."""
    if settings.GOOGLE_APPLICATION_CREDENTIALS and _load_vertex_credentials():
        return settings.VERTEX_MODEL_AGENT
    return settings.ANTHROPIC_MODEL_AGENT


def get_langchain_llm(model: str | None = None):
    """
    Return a LangChain chat model for use in LangGraph agents.
    Prefers ChatVertexAI when credentials are available.
    """
    creds = _load_vertex_credentials()

    if creds:
        project_id, region = creds
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = settings.GOOGLE_APPLICATION_CREDENTIALS
        from langchain_google_vertexai import ChatVertexAI
        return ChatVertexAI(
            model_name=model or settings.VERTEX_MODEL_AGENT,
            project=project_id,
            location=region,
            streaming=True,
            max_output_tokens=4096,
        )

    if settings.ANTHROPIC_API_KEY:
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=model or settings.ANTHROPIC_MODEL_AGENT,
            api_key=settings.ANTHROPIC_API_KEY,
            streaming=True,
        )

    raise RuntimeError("No LLM credentials configured for LangChain.")


async def embed_text_vertex(text_input: str) -> list[float]:
    """
    Embed text using Google's text-embedding-004 via Vertex AI.
    Falls back to OpenAI text-embedding-3-small if Vertex creds are unavailable.
    """
    creds = _load_vertex_credentials()

    if creds:
        project_id, region = creds
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = settings.GOOGLE_APPLICATION_CREDENTIALS

        from google.cloud import aiplatform
        from vertexai.language_models import TextEmbeddingModel
        import vertexai

        vertexai.init(project=project_id, location=region)
        embedding_model = TextEmbeddingModel.from_pretrained("text-embedding-004")
        embeddings = embedding_model.get_embeddings([text_input])
        return embeddings[0].values

    # Fallback: OpenAI
    if settings.OPENAI_API_KEY:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        response = await client.embeddings.create(
            model="text-embedding-3-small",
            input=text_input,
        )
        return response.data[0].embedding

    raise RuntimeError("No embedding credentials configured.")
