-- ============================================================
-- CTM Platform — Migration 005: Messaging Schema (M7)
-- ============================================================

BEGIN;

-- ─── Channels ───────────────────────────────────────────────
CREATE TABLE channels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES pm.projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('public','private','dm')),
  members         UUID[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON channels(workspace_id);
CREATE INDEX ON channels(project_id) WHERE project_id IS NOT NULL;

-- ─── Messages ───────────────────────────────────────────────
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL CHECK (length(body) <= 50000),
  body_tsvector   TSVECTOR,
  attachments     JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX ON messages(channel_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX ON messages USING GIN (body_tsvector);

-- Auto-update tsvector on insert/update
CREATE OR REPLACE FUNCTION messages_tsvector_trigger() RETURNS TRIGGER AS $$
BEGIN
  NEW.body_tsvector = to_tsvector('english', NEW.body);
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_tsvector_update
  BEFORE INSERT OR UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_tsvector_trigger();

-- ─── Comments ───────────────────────────────────────────────
CREATE TABLE comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sheet_id        UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  target_type     TEXT NOT NULL CHECK (target_type IN ('cell','row','column','sheet')),
  target_ref      TEXT NOT NULL,  -- "r{rowId}c{colId}" | rowId | colId | sheetId
  parent_id       UUID REFERENCES comments(id) ON DELETE CASCADE,
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

CREATE INDEX ON comments(sheet_id, target_ref) WHERE deleted_at IS NULL;
CREATE INDEX ON comments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX ON comments USING GIN (body_tsvector);

CREATE OR REPLACE FUNCTION comments_tsvector_trigger() RETURNS TRIGGER AS $$
BEGIN
  NEW.body_tsvector = to_tsvector('english', NEW.body);
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER comments_tsvector_update
  BEFORE INSERT OR UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION comments_tsvector_trigger();

-- ─── Comment Reactions ──────────────────────────────────────
CREATE TABLE comment_reactions (
  comment_id      UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comment_id, user_id, emoji)
);

-- ─── Notifications ──────────────────────────────────────────
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  read            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON notifications(user_id, read, created_at DESC);

-- ─── Notification Preferences ───────────────────────────────
CREATE TABLE notification_prefs (
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type   TEXT NOT NULL,
  channel             TEXT NOT NULL CHECK (channel IN ('in_app','email','webhook')),
  digest_mode         TEXT NOT NULL DEFAULT 'immediate'
                        CHECK (digest_mode IN ('immediate','hourly','daily')),
  PRIMARY KEY (user_id, notification_type, channel)
);

-- ─── Channel Member Tracking ────────────────────────────────
CREATE TABLE channel_members (
  channel_id      UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_seen_at    TIMESTAMPTZ,
  PRIMARY KEY (channel_id, user_id)
);

-- ─── Webhooks ───────────────────────────────────────────────
CREATE TABLE webhooks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  secret          TEXT NOT NULL,  -- HMAC signing secret
  events          TEXT[] NOT NULL DEFAULT '{}',
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_fired_at   TIMESTAMPTZ
);

CREATE INDEX ON webhooks(workspace_id) WHERE enabled = TRUE;

COMMIT;
