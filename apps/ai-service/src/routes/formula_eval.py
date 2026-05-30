"""
AI Formula Evaluation — =AI.QUERY, =AI.SUMMARIZE, =AI.CLASSIFY, =AI.EXTRACT
POST /formula/eval → { result }
"""
from __future__ import annotations

import hashlib
import json
from typing import Optional

import httpx
import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_session
from ..guards.security import RequestContext, guard_auth
from ..llm_client import get_async_client, get_primary_model

log = structlog.get_logger()
router = APIRouter()


class FormulaEvalRequest(BaseModel):
    formula: str       # =AI.QUERY("find total sales", A1:D100)
    cellRef: str       # r{rowId}c{colId}
    contextRange: Optional[str] = None
    sheetId: str
    workspaceId: str
    userId: str


async def _get_redis() -> aioredis.Redis:
    return aioredis.from_url(settings.REDIS_URL)


@router.post("/formula/eval")
async def eval_formula(
    body: FormulaEvalRequest,
    session: AsyncSession = Depends(get_session),
):
    """Evaluate an =AI.* formula and return the result. Cached in Redis (1h TTL)."""
    redis = await _get_redis()

    # ── Cache check ───────────────────────────────────────────
    cache_key = hashlib.sha256(
        f"{body.formula}::{body.contextRange or ''}".encode()
    ).hexdigest()

    redis_key = f"ai:formula:{cache_key}"
    cached = await redis.get(redis_key)
    if cached:
        result = cached.decode()
        await _callback(body, result)
        return {"result": result, "cached": True}

    # ── Build prompt from formula ──────────────────────────────
    formula_upper = body.formula.upper()

    if "AI.QUERY" in formula_upper:
        prompt_text = _extract_first_arg(body.formula)
        prompt = f"Answer this data question concisely: {prompt_text}"
    elif "AI.SUMMARIZE" in formula_upper:
        prompt = f"Summarize the following data in 1-2 sentences: {body.contextRange}"
    elif "AI.CLASSIFY" in formula_upper:
        args = _extract_args(body.formula)
        prompt = f"Classify the text '{args[0] if args else ''}' into one of these categories: {args[1] if len(args) > 1 else ''}. Return only the category name."
    elif "AI.EXTRACT" in formula_upper:
        args = _extract_args(body.formula)
        prompt = f"Extract the {args[1] if len(args) > 1 else 'value'} from: '{args[0] if args else ''}'. Return only the extracted value."
    else:
        prompt = body.formula

    # ── Call LLM ───────────────────────────────────────────────
    client = get_async_client()

    try:
        response = await client.messages.create(
            model=get_primary_model(),
            max_tokens=256,
            system=(
                "You are evaluating a spreadsheet formula function. "
                "Return only the computed value — no explanation, no formatting. "
                "Keep it concise (under 200 characters)."
            ),
            messages=[{"role": "user", "content": prompt}],
        )

        result = response.content[0].text.strip() if response.content else "#AI_ERR!"

        # ── Cache result ───────────────────────────────────────
        await redis.setex(redis_key, 3600, result)

        # ── Callback to M3 to update the cell ─────────────────
        await _callback(body, result)

        return {"result": result, "cached": False}

    except TimeoutError:
        return {"result": "#TIMEOUT!", "cached": False}
    except Exception as e:
        log.error("AI formula eval failed", error=str(e))
        return {"result": "#AI_ERR!", "cached": False}


async def _callback(body: FormulaEvalRequest, result: str) -> None:
    """POST the result back to M3 API Gateway."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                settings.FORMULA_CALLBACK_URL,
                json={
                    "sheetId": body.sheetId,
                    "cellRef": body.cellRef,
                    "result": result,
                    "cacheKey": hashlib.sha256(f"{body.formula}::{body.contextRange or ''}".encode()).hexdigest(),
                },
                headers={
                    "X-Workspace-Id": body.workspaceId,
                    "X-User-Id": body.userId,
                    "X-Client-Cert-CN": "ai-service",
                },
            )
    except Exception as e:
        log.warning("Formula callback failed", error=str(e))


def _extract_first_arg(formula: str) -> str:
    """Extract first string argument from formula like =AI.QUERY("text", A1:B10)."""
    import re
    match = re.search(r'"([^"]*)"', formula)
    return match.group(1) if match else formula


def _extract_args(formula: str) -> list[str]:
    """Extract all string/cell arguments from an AI formula."""
    import re
    return re.findall(r'"([^"]*)"', formula)
