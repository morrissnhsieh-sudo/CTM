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


class UnifiedAsyncClient:
    def __init__(self, anthropic_client, project_id: str | None = None, region: str | None = None):
        self.anthropic_client = anthropic_client
        self.project_id = project_id
        self.region = region
        self.messages = UnifiedMessages(anthropic_client, project_id, region)


class UnifiedMessages:
    def __init__(self, anthropic_client, project_id: str | None = None, region: str | None = None):
        self.anthropic_client = anthropic_client
        self.project_id = project_id
        self.region = region

    def stream(self, model: str, max_tokens: int, system: str, messages: list[dict]):
        if "gemini" in model.lower():
            return GeminiStreamContext(model, max_tokens, system, messages, self.project_id, self.region)
        else:
            return self.anthropic_client.messages.stream(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=messages
            )

    async def create(self, model: str, max_tokens: int, system: str, messages: list[dict]):
        if "gemini" in model.lower():
            import vertexai
            from vertexai.generative_models import GenerativeModel, GenerationConfig
            vertexai.init(project=self.project_id, location=self.region)
            
            gemini_model = GenerativeModel(
                model,
                system_instruction=system
            )
            user_prompt = messages[-1]["content"] if messages else ""
            config = GenerationConfig(max_output_tokens=max_tokens)
            
            response = await gemini_model.generate_content_async(
                user_prompt,
                generation_config=config
            )
            
            class Content:
                def __init__(self, text):
                    self.text = text
                    
            class Response:
                def __init__(self, text):
                    self.content = [Content(text)]
                    
            return Response(response.text)
        else:
            return await self.anthropic_client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=messages
            )


class GeminiStreamContext:
    def __init__(self, model, max_tokens, system, messages, project_id, region):
        self.model = model
        self.max_tokens = max_tokens
        self.system = system
        self.messages = messages
        self.project_id = project_id
        self.region = region

    async def __aenter__(self):
        import vertexai
        from vertexai.generative_models import GenerativeModel, GenerationConfig
        vertexai.init(project=self.project_id, location=self.region)
        
        gemini_model = GenerativeModel(
            self.model,
            system_instruction=self.system
        )
        user_prompt = self.messages[-1]["content"] if self.messages else ""
        config = GenerationConfig(max_output_tokens=self.max_tokens)
        
        self.response_stream = await gemini_model.generate_content_async(
            user_prompt,
            generation_config=config,
            stream=True
        )
        
        class TextStream:
            def __init__(self, stream):
                self.stream = stream
            def __aiter__(self):
                return self
            async def __anext__(self):
                try:
                    chunk = await self.stream.__anext__()
                    return chunk.text
                except StopAsyncIteration:
                    raise StopAsyncIteration
                except Exception:
                    raise StopAsyncIteration
        
        self.text_stream = TextStream(self.response_stream)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass


def get_async_client() -> UnifiedAsyncClient:
    """
    Return a unified async client that routes to Gemini or Anthropic.
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
            log.info("Using AnthropicVertex client wrapped in UnifiedAsyncClient", project=project_id, region=region)
            return UnifiedAsyncClient(client, project_id, region)

    # ── Direct Anthropic ───────────────────────────────────────
    if settings.ANTHROPIC_API_KEY:
        import anthropic
        log.info("Using Anthropic direct client wrapped in UnifiedAsyncClient")
        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        return UnifiedAsyncClient(client)

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
