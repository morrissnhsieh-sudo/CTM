"""
M6 — AI Agent Service
Unit tests: LLM client factory (Vertex AI → Anthropic → OpenAI fallback)

Spec refs:
  - Primary: AnthropicVertex (Google Cloud Vertex AI)
  - Project: d-sxd110x-ssd1-aaos, Region: us-east5
  - Models: claude-sonnet-4-5@20241022 (primary), claude-opus-4-5@20240801 (agent)
  - Fallback: AsyncAnthropic if ANTHROPIC_API_KEY set
  - Raises RuntimeError if no credentials configured
  - Credential loading: reads project_id from service account JSON
"""
import json
import os
import sys
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, mock_open

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "apps", "ai-service"))


class TestVertexCredentialLoading:
    """Tests for _load_vertex_credentials()"""

    def test_returns_none_when_no_credentials_path(self):
        from src.llm_client import _load_vertex_credentials
        _load_vertex_credentials.cache_clear()

        with patch("src.llm_client.settings") as mock_settings:
            mock_settings.GOOGLE_APPLICATION_CREDENTIALS = ""
            result = _load_vertex_credentials()
        assert result is None

    def test_returns_none_when_file_does_not_exist(self):
        from src.llm_client import _load_vertex_credentials
        _load_vertex_credentials.cache_clear()

        with patch("src.llm_client.settings") as mock_settings:
            mock_settings.GOOGLE_APPLICATION_CREDENTIALS = "/nonexistent/path.json"
            mock_settings.VERTEX_PROJECT_ID = "proj"
            mock_settings.VERTEX_REGION = "us-east5"
            result = _load_vertex_credentials()
        assert result is None

    def test_returns_project_and_region_from_valid_file(self, tmp_path):
        from src.llm_client import _load_vertex_credentials
        _load_vertex_credentials.cache_clear()

        sa_key = {
            "type": "service_account",
            "project_id": "my-test-project",
            "private_key_id": "key123",
            "client_email": "sa@my-test-project.iam.gserviceaccount.com",
        }
        key_file = tmp_path / "key.json"
        key_file.write_text(json.dumps(sa_key))

        with patch("src.llm_client.settings") as mock_settings:
            mock_settings.GOOGLE_APPLICATION_CREDENTIALS = str(key_file)
            mock_settings.VERTEX_PROJECT_ID = "fallback-project"
            mock_settings.VERTEX_REGION = "us-east5"
            result = _load_vertex_credentials()

        assert result is not None
        project_id, region = result
        assert project_id == "my-test-project"
        assert region == "us-east5"

    def test_uses_settings_project_id_when_not_in_file(self, tmp_path):
        from src.llm_client import _load_vertex_credentials
        _load_vertex_credentials.cache_clear()

        sa_key = {"type": "service_account"}  # no project_id
        key_file = tmp_path / "key.json"
        key_file.write_text(json.dumps(sa_key))

        with patch("src.llm_client.settings") as mock_settings:
            mock_settings.GOOGLE_APPLICATION_CREDENTIALS = str(key_file)
            mock_settings.VERTEX_PROJECT_ID = "settings-project"
            mock_settings.VERTEX_REGION = "us-central1"
            result = _load_vertex_credentials()

        project_id, _ = result
        assert project_id == "settings-project"


class TestGetPrimaryModel:
    def test_returns_vertex_model_when_vertex_credentials_available(self, tmp_path):
        from src.llm_client import get_primary_model, _load_vertex_credentials
        _load_vertex_credentials.cache_clear()

        key_file = tmp_path / "key.json"
        key_file.write_text(json.dumps({"type": "service_account", "project_id": "proj"}))

        with patch("src.llm_client.settings") as mock_settings:
            mock_settings.GOOGLE_APPLICATION_CREDENTIALS = str(key_file)
            mock_settings.VERTEX_PROJECT_ID = "proj"
            mock_settings.VERTEX_REGION = "us-east5"
            mock_settings.VERTEX_MODEL_PRIMARY = "claude-sonnet-4-5@20241022"
            mock_settings.ANTHROPIC_MODEL_PRIMARY = "claude-sonnet-4-5"
            model = get_primary_model()
        assert "vertex" in model.lower() or "@" in model  # Vertex model IDs contain @

    def test_returns_anthropic_model_when_no_vertex(self):
        from src.llm_client import get_primary_model, _load_vertex_credentials
        _load_vertex_credentials.cache_clear()

        with patch("src.llm_client.settings") as mock_settings:
            mock_settings.GOOGLE_APPLICATION_CREDENTIALS = ""
            mock_settings.ANTHROPIC_MODEL_PRIMARY = "claude-sonnet-4-5"
            model = get_primary_model()
        assert model == "claude-sonnet-4-5"


class TestGetAgentModel:
    def test_opus_model_used_for_agents(self):
        from src.llm_client import get_agent_model, _load_vertex_credentials
        _load_vertex_credentials.cache_clear()

        with patch("src.llm_client.settings") as mock_settings:
            mock_settings.GOOGLE_APPLICATION_CREDENTIALS = ""
            mock_settings.ANTHROPIC_MODEL_AGENT = "claude-opus-4-5"
            model = get_agent_model()
        assert "opus" in model.lower()


class TestEmbedTextFallback:
    """Embedding fallback to OpenAI when Vertex unavailable"""

    @pytest.mark.asyncio
    async def test_raises_when_no_credentials(self):
        from src.llm_client import embed_text_vertex, _load_vertex_credentials
        _load_vertex_credentials.cache_clear()

        with patch("src.llm_client._load_vertex_credentials", return_value=None), \
             patch("src.llm_client.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            with pytest.raises(RuntimeError, match="No embedding credentials"):
                await embed_text_vertex("test text")

    @pytest.mark.asyncio
    async def test_uses_openai_fallback_when_no_vertex(self):
        from src.llm_client import embed_text_vertex, _load_vertex_credentials
        _load_vertex_credentials.cache_clear()

        mock_embedding = [0.1] * 1536
        mock_response = MagicMock()
        mock_response.data = [MagicMock(embedding=mock_embedding)]

        with patch("src.llm_client._load_vertex_credentials", return_value=None), \
             patch("src.llm_client.settings") as mock_settings, \
             patch("openai.AsyncOpenAI") as mock_openai_cls:
            mock_settings.OPENAI_API_KEY = "sk-test"
            mock_settings.VERTEX_REGION = "us-east5"
            mock_client = AsyncMock()
            mock_client.embeddings.create = AsyncMock(return_value=mock_response)
            mock_openai_cls.return_value = mock_client

            result = await embed_text_vertex("test text")
        assert len(result) == 1536
