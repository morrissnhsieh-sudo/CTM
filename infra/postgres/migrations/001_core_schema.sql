-- ============================================================
-- CTM Platform — Migration 001: Core Schema
-- ============================================================

BEGIN;

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- ─── Schemas ────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS collab;
CREATE SCHEMA IF NOT EXISTS pm;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS audit;

-- ─── Workspaces ─────────────────────────────────────────────
CREATE TABLE workspaces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  plan            TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','business','enterprise')),
  owner_id        UUID NOT NULL,
  settings        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- ─── Users ──────────────────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  name            TEXT NOT NULL,
  avatar_url      TEXT,
  role            TEXT NOT NULL DEFAULT 'VIEWER'
                    CHECK (role IN ('OWNER','ADMIN','EDITOR','COMMENTER','VIEWER')),
  last_active     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, email)
);

CREATE INDEX ON users(workspace_id);
CREATE INDEX ON users(email);

-- ─── Sheets ─────────────────────────────────────────────────
CREATE TABLE sheets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id      UUID,   -- FK to pm.projects added after pm schema
  title           TEXT NOT NULL,
  description     TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  settings        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at     TIMESTAMPTZ
);

CREATE INDEX ON sheets(workspace_id);
CREATE INDEX ON sheets(project_id) WHERE project_id IS NOT NULL;

-- ─── Columns ────────────────────────────────────────────────
CREATE TABLE columns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id        UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN (
                    'text','number','currency','date','datetime',
                    'checkbox','dropdown','multi_select','attachment',
                    'formula','url','contact','auto_number','ai_generated'
                  )),
  position        INTEGER NOT NULL,
  width           INTEGER NOT NULL DEFAULT 150,
  frozen          BOOLEAN NOT NULL DEFAULT FALSE,
  hidden          BOOLEAN NOT NULL DEFAULT FALSE,
  format          JSONB NOT NULL DEFAULT '{}',
  validation      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sheet_id, position)
);

CREATE INDEX ON columns(sheet_id);

-- ─── Rows ───────────────────────────────────────────────────
CREATE TABLE rows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id        UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX ON rows(sheet_id, position) WHERE deleted_at IS NULL;
CREATE INDEX ON rows(sheet_id) WHERE deleted_at IS NULL;

-- ─── Cells ──────────────────────────────────────────────────
CREATE TABLE cells (
  row_id          UUID NOT NULL REFERENCES rows(id) ON DELETE CASCADE,
  col_id          UUID NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  value           TEXT,
  formula         TEXT,
  format          JSONB NOT NULL DEFAULT '{}',
  updated_by      UUID NOT NULL REFERENCES users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (row_id, col_id)
);

CREATE INDEX ON cells(col_id);
-- Full-text search index on cell values
CREATE INDEX ON cells USING GIN (to_tsvector('english', COALESCE(value, '')));

-- ─── Attachments ────────────────────────────────────────────
CREATE TABLE attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  row_id          UUID REFERENCES rows(id) ON DELETE CASCADE,
  col_id          UUID REFERENCES columns(id) ON DELETE SET NULL,
  filename        TEXT NOT NULL,
  s3_key          TEXT NOT NULL UNIQUE,
  size_bytes      BIGINT NOT NULL,
  mime_type       TEXT NOT NULL,
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX ON attachments(row_id, col_id);

-- ─── Sharing ────────────────────────────────────────────────
CREATE TABLE sharing (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type   TEXT NOT NULL CHECK (resource_type IN ('workspace','sheet','project')),
  resource_id     UUID NOT NULL,
  principal_type  TEXT NOT NULL CHECK (principal_type IN ('user','group','public')),
  principal_id    UUID,   -- NULL for public
  role            TEXT NOT NULL CHECK (role IN ('OWNER','ADMIN','EDITOR','COMMENTER','VIEWER')),
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON sharing(resource_type, resource_id);
CREATE INDEX ON sharing(principal_id) WHERE principal_id IS NOT NULL;

-- ─── API Tokens ─────────────────────────────────────────────
CREATE TABLE api_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  token_hash      TEXT NOT NULL UNIQUE,   -- SHA-256 of raw token
  role            TEXT NOT NULL CHECK (role IN ('OWNER','ADMIN','EDITOR','COMMENTER','VIEWER')),
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ
);

CREATE INDEX ON api_tokens(user_id);
CREATE INDEX ON api_tokens(token_hash);

COMMIT;
