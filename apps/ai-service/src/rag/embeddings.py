"""
RAG Pipeline — Retrieval-Augmented Generation.

Flow: NL query → embed query → cosine similarity search in pgvector
      (top-K=20) → inject retrieved chunks into LLM context → generate response.
"""
from __future__ import annotations

from typing import Optional

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..llm_client import embed_text_vertex

log = structlog.get_logger()


async def embed_text(text_input: str) -> list[float]:
    """
    Embed text using the configured embedding backend.
    Delegates to llm_client.embed_text_vertex which handles
    Vertex AI (text-embedding-004) → OpenAI fallback.
    """
    return await embed_text_vertex(text_input)


async def index_row(
    session: AsyncSession,
    sheet_id: str,
    row_id: str,
    row_data: dict,
) -> None:
    """Create or update the embedding for a row."""
    # Chunk text: "Sheet: {name} | Row {n}: col1=val1, col2=val2, …"
    chunk = " | ".join(f"{k}={v}" for k, v in row_data.items() if v is not None)
    if not chunk:
        return

    embedding = await embed_text(chunk)
    vector_str = "[" + ",".join(str(x) for x in embedding) + "]"

    await session.execute(
        text("""
            INSERT INTO ai.embeddings (sheet_id, row_id, chunk_text, embedding)
            VALUES (:sheet_id, :row_id, :chunk_text, :embedding::vector)
            ON CONFLICT (sheet_id, row_id) DO UPDATE
            SET chunk_text = :chunk_text, embedding = :embedding::vector, created_at = NOW()
        """),
        {
            "sheet_id": sheet_id,
            "row_id": row_id,
            "chunk_text": chunk,
            "embedding": vector_str,
        },
    )
    await session.commit()


async def retrieve_similar_chunks(
    session: AsyncSession,
    sheet_id: str,
    query: str,
    accessible_sheet_ids: list[str],
    top_k: int = 20,
) -> list[dict]:
    """ANN search using pgvector cosine similarity."""
    query_embedding = await embed_text(query)
    vector_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    result = await session.execute(
        text("""
            SELECT
                row_id,
                chunk_text,
                1 - (embedding <=> :embedding::vector) AS similarity
            FROM ai.embeddings
            WHERE sheet_id = ANY(:sheet_ids::uuid[])
            ORDER BY embedding <=> :embedding::vector
            LIMIT :top_k
        """),
        {
            "embedding": vector_str,
            "sheet_ids": accessible_sheet_ids,
            "top_k": top_k,
        },
    )

    return [
        {"row_id": row[0], "chunk_text": row[1], "similarity": float(row[2])}
        for row in result.fetchall()
    ]
