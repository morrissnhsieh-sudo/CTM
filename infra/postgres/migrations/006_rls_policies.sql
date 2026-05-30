-- ============================================================
-- CTM Platform — Migration 006: Row-Level Security Policies
-- ============================================================
-- Every transaction must SET LOCAL app.workspace_id = '<uuid>'
-- before executing queries. RLS policies enforce workspace
-- isolation at the database layer.
-- ============================================================

BEGIN;

-- ─── Enable RLS on all tables ───────────────────────────────
ALTER TABLE workspaces       ENABLE ROW LEVEL SECURITY;
ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE columns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE rows             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cells            ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sharing          ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_tokens       ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.projects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.approvals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.workflow_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.time_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.embeddings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.query_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.agent_sessions ENABLE ROW LEVEL SECURITY;

-- ─── Helper function ────────────────────────────────────────
CREATE OR REPLACE FUNCTION current_workspace_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.workspace_id', TRUE), '')::UUID
$$ LANGUAGE SQL STABLE;

-- ─── Workspace policies ─────────────────────────────────────
CREATE POLICY workspace_isolation ON workspaces
  USING (id = current_workspace_id());

-- ─── Users policies ─────────────────────────────────────────
CREATE POLICY users_workspace_isolation ON users
  USING (workspace_id = current_workspace_id());

-- ─── Sheets policies ────────────────────────────────────────
CREATE POLICY sheets_workspace_isolation ON sheets
  USING (workspace_id = current_workspace_id());

-- ─── Columns policies ───────────────────────────────────────
CREATE POLICY columns_via_sheet ON columns
  USING (sheet_id IN (
    SELECT id FROM sheets WHERE workspace_id = current_workspace_id()
  ));

-- ─── Rows policies ──────────────────────────────────────────
CREATE POLICY rows_via_sheet ON rows
  USING (sheet_id IN (
    SELECT id FROM sheets WHERE workspace_id = current_workspace_id()
  ));

-- ─── Cells policies ─────────────────────────────────────────
CREATE POLICY cells_via_row ON cells
  USING (row_id IN (
    SELECT r.id FROM rows r
    JOIN sheets s ON s.id = r.sheet_id
    WHERE s.workspace_id = current_workspace_id()
  ));

-- ─── Attachments policies ───────────────────────────────────
CREATE POLICY attachments_workspace_isolation ON attachments
  USING (workspace_id = current_workspace_id());

-- ─── Sharing policies ───────────────────────────────────────
CREATE POLICY sharing_workspace_isolation ON sharing
  USING (resource_id IN (
    SELECT id FROM sheets WHERE workspace_id = current_workspace_id()
    UNION ALL
    SELECT id FROM workspaces WHERE id = current_workspace_id()
  ));

-- ─── API Tokens policies ────────────────────────────────────
CREATE POLICY api_tokens_workspace_isolation ON api_tokens
  USING (workspace_id = current_workspace_id());

-- ─── Channels policies ──────────────────────────────────────
CREATE POLICY channels_workspace_isolation ON channels
  USING (workspace_id = current_workspace_id());

-- ─── Messages policies ──────────────────────────────────────
CREATE POLICY messages_via_channel ON messages
  USING (channel_id IN (
    SELECT id FROM channels WHERE workspace_id = current_workspace_id()
  ));

-- ─── Comments policies ──────────────────────────────────────
CREATE POLICY comments_workspace_isolation ON comments
  USING (workspace_id = current_workspace_id());

-- ─── Notifications policies ─────────────────────────────────
CREATE POLICY notifications_own_user ON notifications
  USING (user_id::text = current_setting('app.user_id', TRUE));

-- ─── PM policies ────────────────────────────────────────────
CREATE POLICY pm_projects_workspace_isolation ON pm.projects
  USING (workspace_id = current_workspace_id());

CREATE POLICY pm_tasks_via_project ON pm.tasks
  USING (project_id IN (
    SELECT id FROM pm.projects WHERE workspace_id = current_workspace_id()
  ));

CREATE POLICY pm_approvals_via_sheet ON pm.approvals
  USING (sheet_id IN (
    SELECT id FROM sheets WHERE workspace_id = current_workspace_id()
  ));

CREATE POLICY pm_triggers_via_sheet ON pm.workflow_triggers
  USING (sheet_id IN (
    SELECT id FROM sheets WHERE workspace_id = current_workspace_id()
  ));

CREATE POLICY pm_time_entries_via_row ON pm.time_entries
  USING (row_id IN (
    SELECT r.id FROM rows r
    JOIN sheets s ON s.id = r.sheet_id
    WHERE s.workspace_id = current_workspace_id()
  ));

-- ─── AI policies ────────────────────────────────────────────
CREATE POLICY ai_embeddings_via_sheet ON ai.embeddings
  USING (sheet_id IN (
    SELECT id FROM sheets WHERE workspace_id = current_workspace_id()
  ));

CREATE POLICY ai_query_log_workspace_isolation ON ai.query_log
  USING (workspace_id = current_workspace_id());

CREATE POLICY ai_agent_sessions_own_user ON ai.agent_sessions
  USING (user_id::text = current_setting('app.user_id', TRUE));

-- ─── Bypass RLS for superuser (migrations, admin tasks) ─────
-- Services connect as non-superuser role "ctm_app" — RLS enforced
-- Migration runner connects as "ctm_admin" — RLS bypassed
CREATE ROLE ctm_app NOLOGIN;
CREATE ROLE ctm_admin NOLOGIN BYPASSRLS;

GRANT USAGE ON SCHEMA public, collab, pm, ai, audit TO ctm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ctm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA collab TO ctm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pm TO ctm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ai TO ctm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ctm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA collab TO ctm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pm TO ctm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ai TO ctm_app;

COMMIT;
