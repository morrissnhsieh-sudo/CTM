"""CTM AI Agent Service — M6"""
from contextlib import asynccontextmanager

import structlog
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db, close_db
from .kafka.consumer import start_consumer, stop_consumer
from .routes import query, formula, agent, formula_eval

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await start_consumer()
    log.info("AI service started", port=settings.PORT)
    yield
    await stop_consumer()
    await close_db()
    log.info("AI service stopped")


app = FastAPI(
    title="CTM AI Agent Service",
    version="1.0.0",
    description="LLM intelligence layer for the CTM platform",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # internal service — no public CORS needed
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routes ──────────────────────────────────────────────────────────────────
app.include_router(query.router,        prefix="",       tags=["NL Query"])
app.include_router(formula.router,      prefix="",       tags=["Formula"])
app.include_router(agent.router,        prefix="",       tags=["Agent"])
app.include_router(formula_eval.router, prefix="",       tags=["Formula Eval"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-service"}


if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        workers=4,
        log_config=None,  # use structlog
    )
