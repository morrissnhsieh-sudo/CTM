-- ============================================================
-- CTM Platform — Migration 004: AI Schema (M6)
-- Requires: pgvector extension
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── RAG Embeddings ─────────────────────────────────────────
-- One row per chunk (each spreadsheet row is one chunk)
CREATE TABLE ai.embeddings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id        UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  row_id          UUID NOT NULL REFERENCES rows(id) ON DELETE CASCADE,
  chunk_text      TEXT NOT NULL,
  embedding       vector(1536) NOT NULL,  -- OpenAI 1536-dim or voyage-3 padded
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sheet_id, row_id)
);

-- HNSW index for fast approximate nearest-neighbour search
-- m=16, ef_construction=64 — good balance for OLTP workloads
CREATE INDEX ON ai.embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX ON ai.embeddings(sheet_id);

-- ─── Query Log ──────────────────────────────────────────────
CREATE TABLE ai.query_log (
  id              UUID DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt          TEXT NOT NULL,
  generated_sql   TEXT,
  result_count    INT,
  latency_ms      INT,
  input_tokens    INT,
  output_tokens   INT,
  model           TEXT NOT NULL,
  data_included   BOOLEAN NOT NULL DEFAULT FALSE,
  columns_included UUID[] NOT NULL DEFAULT '{}',
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE ai.query_log_2026_05
  PARTITION OF ai.query_log
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE ai.query_log_2026_06
  PARTITION OF ai.query_log
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE INDEX ON ai.query_log(workspace_id, created_at DESC);

-- ─── Formula Cache ──────────────────────────────────────────
CREATE TABLE ai.formula_cache (
  cache_key       TEXT PRIMARY KEY,  -- SHA-256(formula + input)
  formula         TEXT NOT NULL,
  result          TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX ON ai.formula_cache(expires_at);

-- ─── Agent Sessions ─────────────────────────────────────────
CREATE TABLE ai.agent_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sheet_id        UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  agent_type      TEXT NOT NULL,
  graph_state     JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON ai.agent_sessions(user_id, last_active_at DESC);

COMMIT;
