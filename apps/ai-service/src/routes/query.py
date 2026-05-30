"""
Text-to-SQL Natural Language Query endpoint.

POST /query → SSE stream of tokens
"""
from __future__ import annotations

import json
import re
from typing import AsyncGenerator, Optional

import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_session
from ..guards.security import (
    RequestContext,
    SYSTEM_PROMPT,
    guard_auth,
    run_all_guards,
)
from ..llm_client import get_async_client, get_primary_model
from ..rag.embeddings import retrieve_similar_chunks

log = structlog.get_logger()
router = APIRouter()

# SQL safety: whitelist SELECT-only operations
SQL_WHITELIST_RE = re.compile(r"^\s*SELECT\b", re.IGNORECASE)
SQL_DISALLOW_RE = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXEC)\b",
    re.IGNORECASE,
)


class QueryRequest(BaseModel):
    sheetId: str
    prompt: str
    mode: str = "ask"
    contextRange: Optional[str] = None
    dataConsent: bool = False


async def _get_redis() -> aioredis.Redis:
    return aioredis.from_url(settings.REDIS_URL)


@router.post("/query")
async def nl_query(
    body: QueryRequest,
    ctx: RequestContext = Depends(guard_auth),
    session: AsyncSession = Depends(get_session),
):
    """Stream a natural language query response as SSE."""
    redis = await _get_redis()

    data_allowed = await run_all_guards(
        ctx=ctx,
        prompt=body.prompt,
        operation="nl_query",
        data_consent=body.dataConsent,
        redis_client=redis,
    )

    return StreamingResponse(
        _stream_nl_query(body, ctx, session, data_allowed),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _stream_nl_query(
    body: QueryRequest,
    ctx: RequestContext,
    session: AsyncSession,
    data_allowed: bool,
) -> AsyncGenerator[str, None]:
    client = get_async_client()

    # ── Step 1: Fetch column schema ────────────────────────────
    from sqlalchemy import text
    cols_result = await session.execute(
        text("""
            SELECT c.name, c.type, c.format
            FROM columns c
            JOIN sheets s ON s.id = c.sheet_id
            WHERE c.sheet_id = :sheet_id
            ORDER BY c.position
        """),
        {"sheet_id": body.sheetId},
    )
    columns = [
        {"name": row[0], "type": row[1], "format": row[2]}
        for row in cols_result.fetchall()
    ]

    schema_desc = "\n".join(
        f"- {col['name']} (type: {col['type']})"
        for col in columns
    )

    # ── Step 2: RAG context (if data consent granted) ──────────
    rag_context = ""
    if data_allowed:
        chunks = await retrieve_similar_chunks(
            session,
            body.sheetId,
            body.prompt,
            [body.sheetId],
            top_k=20,
        )
        if chunks:
            rag_context = "\n\nRelevant data rows:\n" + "\n".join(
                f"- {c['chunk_text']}" for c in chunks[:10]
            )

    # ── Step 3: Build system + user message ────────────────────
    system = (
        SYSTEM_PROMPT
        + f"\n\nSpreadsheet schema:\n{schema_desc}"
        + f"\n\nGenerate a PostgreSQL SELECT query. Return JSON with keys: sql, explanation."
        + rag_context
    )

    # ── Step 4: Stream LLM response ────────────────────────────
    try:
        async with client.messages.stream(
            model=get_primary_model(),
            max_tokens=2048,
            system=system,
            messages=[{"role": "user", "content": body.prompt}],
        ) as stream:
            accumulated = ""
            async for text_chunk in stream.text_stream:
                accumulated += text_chunk
                yield f"event: token\ndata: {json.dumps({'token': text_chunk})}\n\n"

        # ── Step 5: Parse SQL and execute ──────────────────────
        try:
            result_json = json.loads(accumulated)
            sql = result_json.get("sql", "")
            explanation = result_json.get("explanation", accumulated)
        except json.JSONDecodeError:
            sql = ""
            explanation = accumulated

        rows = []
        if sql and SQL_WHITELIST_RE.match(sql) and not SQL_DISALLOW_RE.search(sql):
            try:
                # Execute against read replica
                res = await session.execute(text(sql))
                rows = [dict(zip(res.keys(), row)) for row in res.fetchmany(500)]
            except Exception as e:
                log.warning("SQL execution failed", sql=sql, error=str(e))
                explanation += f"\n\n(Note: SQL execution failed: {e})"

        yield f"event: result\ndata: {json.dumps({'explanation': explanation, 'sql': sql, 'rows': rows})}\n\n"
        yield "event: done\ndata: {}\n\n"

    except Exception as e:
        log.error("Anthropic API error", error=str(e))
        yield f"event: error\ndata: {json.dumps({'code': 'LLM_ERROR', 'message': str(e)})}\n\n"
