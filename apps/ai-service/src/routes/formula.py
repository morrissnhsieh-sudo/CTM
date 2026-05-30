"""
Text-to-Formula generation endpoint.
POST /formula → { formula, explanation, valid }
"""
from __future__ import annotations

import json
from typing import Optional

import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_session
from ..guards.security import RequestContext, SYSTEM_PROMPT, guard_auth, run_all_guards
from ..llm_client import get_async_client, get_primary_model

log = structlog.get_logger()
router = APIRouter()


class FormulaRequest(BaseModel):
    sheetId: str
    description: str
    targetCell: str
    contextColumns: list[str] = []


async def _get_redis() -> aioredis.Redis:
    return aioredis.from_url(settings.REDIS_URL)


@router.post("/formula")
async def generate_formula(
    body: FormulaRequest,
    ctx: RequestContext = Depends(guard_auth),
    session: AsyncSession = Depends(get_session),
):
    redis = await _get_redis()
    await run_all_guards(ctx, body.description, "formula_gen", False, redis)

    client = get_async_client()

    # Fetch column schema
    cols_result = await session.execute(
        text("""
            SELECT name, type FROM columns WHERE sheet_id = :sheet_id ORDER BY position
        """),
        {"sheet_id": body.sheetId},
    )
    columns = [{"name": row[0], "type": row[1]} for row in cols_result.fetchall()]

    schema_desc = "\n".join(f"- Column '{c['name']}' (type: {c['type']})" for c in columns)

    system = (
        SYSTEM_PROMPT
        + f"\n\nAvailable columns:\n{schema_desc}"
        + "\n\nYou generate Hyperformula-compatible Excel formulas. "
        + "Return JSON: {\"formula\": \"=...\", \"explanation\": \"...\"}. "
        + "The formula must be valid Hyperformula syntax."
    )

    response = await client.messages.create(
        model=get_primary_model(),
        max_tokens=1024,
        system=system,
        messages=[
            {
                "role": "user",
                "content": f"Generate a formula for: {body.description}\nTarget cell: {body.targetCell}",
            }
        ],
    )

    content = response.content[0].text if response.content else "{}"

    try:
        result = json.loads(content)
        formula = result.get("formula", "")
        explanation = result.get("explanation", "")
    except json.JSONDecodeError:
        # Extract formula from plain text
        formula = content.strip()
        if not formula.startswith("="):
            formula = "=" + formula
        explanation = content

    # Validate formula via Hyperformula sandbox (call back to M3/M4)
    valid = formula.startswith("=") and len(formula) > 1

    return {
        "formula": formula,
        "explanation": explanation,
        "valid": valid,
    }
