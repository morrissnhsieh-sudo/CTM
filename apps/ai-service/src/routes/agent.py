"""
LangGraph Agent endpoint — streaming SSE.
POST /agent → SSE stream of agent steps.
"""
from __future__ import annotations

import json
import uuid
from typing import AsyncGenerator

import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_session
from ..guards.security import RequestContext, guard_auth, run_all_guards
from ..agents.graph import build_agent_graph, AgentState

log = structlog.get_logger()
router = APIRouter()


class AgentRequest(BaseModel):
    sheetId: str
    agentType: str = "data_analyst"
    prompt: str


async def _get_redis() -> aioredis.Redis:
    return aioredis.from_url(settings.REDIS_URL)


@router.post("/agent")
async def run_agent(
    body: AgentRequest,
    ctx: RequestContext = Depends(guard_auth),
    session: AsyncSession = Depends(get_session),
):
    """Run a LangGraph agent and stream intermediate steps."""
    redis = await _get_redis()
    await run_all_guards(ctx, body.prompt, "nl_query", False, redis)

    return StreamingResponse(
        _stream_agent(body, ctx, session, redis),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _stream_agent(
    body: AgentRequest,
    ctx: RequestContext,
    session: AsyncSession,
    redis_client: aioredis.Redis,
) -> AsyncGenerator[str, None]:
    from langchain_core.messages import HumanMessage

    session_id = str(uuid.uuid4())

    # Fetch column schema
    from sqlalchemy import text
    cols_result = await session.execute(
        text("SELECT name, type FROM columns WHERE sheet_id = :sid ORDER BY position"),
        {"sid": body.sheetId},
    )
    schema = [{"name": r[0], "type": r[1]} for r in cols_result.fetchall()]

    # Build initial state
    initial_state: AgentState = {
        "messages": [HumanMessage(content=body.prompt)],
        "sheet_id": body.sheetId,
        "workspace_id": ctx.workspace_id,
        "user_id": ctx.user_id,
        "user_role": ctx.role,
        "agent_type": body.agentType,
        "schema": schema,
        "context_rows": [],
        "pending_actions": [],
        "approved": False,
        "final_result": None,
    }

    # Save initial state to Redis for multi-turn sessions
    state_key = f"ai:agent:{session_id}"
    await redis_client.setex(state_key, 1800, json.dumps({"session_id": session_id}))

    yield f"event: session\ndata: {json.dumps({'sessionId': session_id})}\n\n"

    graph = build_agent_graph(body.agentType)
    compiled = graph.compile()

    try:
        async for event in compiled.astream(initial_state):
            for node_name, node_output in event.items():
                if node_name == "agent":
                    messages = node_output.get("messages", [])
                    for msg in messages:
                        if hasattr(msg, "content") and msg.content:
                            yield f"event: step\ndata: {json.dumps({'node': 'agent', 'content': str(msg.content)})}\n\n"

                elif node_name == "hitl_pause":
                    # Send pending actions to frontend for approval
                    pending = node_output.get("pending_actions", [])
                    yield f"event: hitl\ndata: {json.dumps({'sessionId': session_id, 'pendingActions': pending})}\n\n"

                elif node_name == "tools":
                    messages = node_output.get("messages", [])
                    for msg in messages:
                        if hasattr(msg, "content"):
                            yield f"event: tool_result\ndata: {json.dumps({'content': str(msg.content)[:500]})}\n\n"

        yield f"event: done\ndata: {json.dumps({'sessionId': session_id})}\n\n"

    except Exception as e:
        log.error("Agent execution failed", error=str(e), session_id=session_id)
        yield f"event: error\ndata: {json.dumps({'code': 'AGENT_ERROR', 'message': str(e)})}\n\n"
