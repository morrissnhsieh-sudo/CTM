-- infra/postgres/migrations/016_collab_view_management.sql

BEGIN;

-- G-4: Attachment scope
ALTER TABLE attachments
  ADD COLUMN scope    TEXT NOT NULL DEFAULT 'row'
                        CHECK (scope IN ('row', 'sheet', 'workspace')),
  ADD COLUMN sheet_id UUID REFERENCES sheets(id) ON DELETE CASCADE;

CREATE INDEX ON attachments(sheet_id) WHERE sheet_id IS NOT NULL;
CREATE INDEX ON attachments(workspace_id, scope);

-- G-6: Proof pin coordinates on discussions
ALTER TABLE discussions
  ADD COLUMN proof_attachment_id UUID REFERENCES attachments(id) ON DELETE CASCADE,
  ADD COLUMN pin_x_pct  NUMERIC(5,4),
  ADD COLUMN pin_y_pct  NUMERIC(5,4);

CREATE INDEX ON discussions(proof_attachment_id) WHERE proof_attachment_id IS NOT NULL;

-- G-8: Public sharing token and column whitelist
ALTER TABLE sharing
  ADD COLUMN public_token   TEXT UNIQUE,
  ADD COLUMN visible_col_ids UUID[];

CREATE INDEX ON sharing(public_token) WHERE public_token IS NOT NULL;

-- G-15: Per-user view state on sheets
ALTER TABLE user_sheet_interactions
  ADD COLUMN settings JSONB NOT NULL DEFAULT '{}';

COMMIT;
