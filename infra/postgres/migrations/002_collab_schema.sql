-- ============================================================
-- CTM Platform — Migration 002: Collaboration Schema (M2)
-- ============================================================

BEGIN;

-- Y.Doc binary storage — one row per sheet
CREATE TABLE collab.documents (
  sheet_id        UUID PRIMARY KEY REFERENCES sheets(id) ON DELETE CASCADE,
  ydoc_binary     BYTEA NOT NULL,
  version         BIGINT NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only CRDT update log — every client op is appended here
-- Partitioned by month for efficient pruning
CREATE TABLE collab.update_log (
  id              BIGSERIAL,
  sheet_id        UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  update_binary   BYTEA NOT NULL,
  client_id       TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create initial monthly partition
CREATE TABLE collab.update_log_2026_05
  PARTITION OF collab.update_log
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE collab.update_log_2026_06
  PARTITION OF collab.update_log
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE INDEX ON collab.update_log(sheet_id, created_at);

-- Periodic full snapshots (every 5 minutes of active editing)
CREATE TABLE collab.snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id        UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  ydoc_binary     BYTEA NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON collab.snapshots(sheet_id, created_at DESC);

COMMIT;
