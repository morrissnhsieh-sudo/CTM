BEGIN;

-- Create folders table
CREATE TABLE IF NOT EXISTS folders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id    UUID REFERENCES folders(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS folders_workspace_idx ON folders(workspace_id);

-- Add folder_id to sheets
ALTER TABLE sheets ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;

-- Create user interactions table for favorites and recents
CREATE TABLE IF NOT EXISTS user_sheet_interactions (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sheet_id     UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  is_favorite  BOOLEAN NOT NULL DEFAULT FALSE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sheet_id)
);

CREATE INDEX IF NOT EXISTS user_sheet_interactions_user_idx ON user_sheet_interactions(user_id);

-- Enable RLS for folders and user interactions
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sheet_interactions ENABLE ROW LEVEL SECURITY;

-- Note: RLS policies using current_workspace_id() helper to match CTM design
DROP POLICY IF EXISTS folders_workspace_isolation ON folders;
CREATE POLICY folders_workspace_isolation ON folders
  USING (workspace_id = current_workspace_id());

DROP POLICY IF EXISTS user_sheet_interactions_workspace_isolation ON user_sheet_interactions;
CREATE POLICY user_sheet_interactions_workspace_isolation ON user_sheet_interactions
  USING (sheet_id IN (
    SELECT id FROM sheets WHERE workspace_id = current_workspace_id()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON folders TO ctm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_sheet_interactions TO ctm_app;

COMMIT;
