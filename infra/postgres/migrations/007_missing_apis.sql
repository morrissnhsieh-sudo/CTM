-- ============================================================
-- CTM Platform — Migration 007: Missing APIs
-- Adds: discussions, export_jobs, import_jobs, webhook_deliveries
-- ============================================================

BEGIN;

-- ─── Discussions (sheet-level threaded comments) ─────────────────────────────
CREATE TABLE discussions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sheet_id        UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  title           TEXT,                                  -- optional subject line
  author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL CHECK (length(body) <= 10000),
  body_tsvector   TSVECTOR,
  resolved        BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX ON discussions(sheet_id) WHERE deleted_at IS NULL;
CREATE INDEX ON discussions USING GIN (body_tsvector);

CREATE OR REPLACE FUNCTION discussions_tsvector_trigger() RETURNS TRIGGER AS $$
BEGIN
  NEW.body_tsvector = to_tsvector('english', COALESCE(NEW.title,'') || ' ' || NEW.body);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER discussions_tsvector_update
  BEFORE INSERT OR UPDATE ON discussions
  FOR EACH ROW EXECUTE FUNCTION discussions_tsvector_trigger();

-- Discussion replies (child comments under a discussion)
CREATE TABLE discussion_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id   UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL CHECK (length(body) <= 10000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX ON discussion_comments(discussion_id) WHERE deleted_at IS NULL;

-- Enable RLS
ALTER TABLE discussions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY discussions_workspace_isolation ON discussions
  USING (workspace_id = current_workspace_id());

CREATE POLICY discussion_comments_via_discussion ON discussion_comments
  USING (discussion_id IN (
    SELECT id FROM discussions WHERE workspace_id = current_workspace_id()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON discussions         TO ctm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON discussion_comments TO ctm_app;

-- ─── Export Jobs (async XLSX / CSV / JSON exports) ───────────────────────────
CREATE TABLE export_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sheet_id        UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  requested_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  format          TEXT NOT NULL CHECK (format IN ('xlsx','csv','json')),
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','processing','ready','failed')),
  row_count       INT,
  s3_key          TEXT,                       -- set when status = ready
  download_url    TEXT,                       -- pre-signed, set when ready
  error_message   TEXT,                       -- set when status = failed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ                 -- URL expiry (15 min after ready)
);

CREATE INDEX ON export_jobs(workspace_id, requested_by, created_at DESC);
CREATE INDEX ON export_jobs(status) WHERE status IN ('queued','processing');

ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY export_jobs_workspace_isolation ON export_jobs
  USING (workspace_id = current_workspace_id());
GRANT SELECT, INSERT, UPDATE ON export_jobs TO ctm_app;

-- ─── Import Jobs (async XLSX / CSV ingestion) ────────────────────────────────
CREATE TABLE import_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sheet_id        UUID REFERENCES sheets(id) ON DELETE SET NULL,  -- target sheet (created on import)
  requested_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  format          TEXT NOT NULL CHECK (format IN ('xlsx','csv')),
  original_name   TEXT NOT NULL,              -- original filename
  s3_key          TEXT NOT NULL,              -- uploaded file in ctm-imports bucket
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','processing','ready','failed')),
  rows_imported   INT DEFAULT 0,
  rows_failed     INT DEFAULT 0,
  error_message   TEXT,
  row_errors      JSONB,                      -- per-row validation errors (max 100)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON import_jobs(workspace_id, requested_by, created_at DESC);
CREATE INDEX ON import_jobs(status) WHERE status IN ('queued','processing');

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_jobs_workspace_isolation ON import_jobs
  USING (workspace_id = current_workspace_id());
GRANT SELECT, INSERT, UPDATE ON import_jobs TO ctm_app;

-- ─── Webhook Deliveries (delivery log + retry tracking) ──────────────────────
CREATE TABLE webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  payload         JSONB NOT NULL,
  attempt         INT NOT NULL DEFAULT 1,     -- 1..5
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','success','failed','retrying')),
  http_status     INT,                        -- response code from recipient
  response_body   TEXT,                       -- truncated to 2KB
  duration_ms     INT,
  error_message   TEXT,
  delivered_at    TIMESTAMPTZ,
  next_retry_at   TIMESTAMPTZ,               -- for exponential backoff
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON webhook_deliveries(webhook_id, created_at DESC);
CREATE INDEX ON webhook_deliveries(status, next_retry_at)
  WHERE status IN ('pending','retrying');
CREATE INDEX ON webhook_deliveries(workspace_id, created_at DESC);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_deliveries_workspace_isolation ON webhook_deliveries
  USING (workspace_id = current_workspace_id());
GRANT SELECT, INSERT, UPDATE ON webhook_deliveries TO ctm_app;

COMMIT;
