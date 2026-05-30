"""
Kafka consumer for M6 — processes ctm.ai.jobs events.
Handles =AI.* formula evaluation jobs published by M4.
"""
from __future__ import annotations

import json
import asyncio

import structlog
from aiokafka import AIOKafkaConsumer

from ..config import settings

log = structlog.get_logger()

_consumer_task: asyncio.Task | None = None


async def start_consumer():
    global _consumer_task
    _consumer_task = asyncio.create_task(_run_consumer())


async def stop_consumer():
    if _consumer_task:
        _consumer_task.cancel()
        try:
            await _consumer_task
        except asyncio.CancelledError:
            pass


async def _run_consumer():
    consumer = AIOKafkaConsumer(
        "ctm.ai.jobs",
        bootstrap_servers=settings.KAFKA_BROKERS,
        group_id="ai-service",
        auto_offset_reset="latest",
    )

    await consumer.start()
    log.info("Kafka consumer started", topic="ctm.ai.jobs")

    try:
        async for msg in consumer:
            try:
                event = json.loads(msg.value.decode())
                await _handle_ai_job(event)
            except Exception as e:
                log.error("Failed to process AI job", error=str(e))
    finally:
        await consumer.stop()


async def _handle_ai_job(event: dict):
    """Handle an =AI.* formula evaluation job."""
    event_type = event.get("type")

    if event_type == "ai.formula.job":
        from ..routes.formula_eval import eval_formula, FormulaEvalRequest
        req = FormulaEvalRequest(
            formula=event.get("formula", ""),
            cellRef=event.get("cellRef", ""),
            contextRange=event.get("contextRange"),
            sheetId=event.get("sheetId", ""),
            workspaceId=event.get("workspaceId", ""),
            userId=event.get("userId", ""),
        )

        log.info("Processing AI formula job", cell_ref=req.cellRef, formula=req.formula[:50])
        # eval_formula requires a DB session — use a fresh session from factory
        from ..db import async_session_factory
        async with async_session_factory() as session:
            await eval_formula(req, session)
