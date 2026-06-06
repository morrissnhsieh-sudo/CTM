BEGIN;

-- Add projectId and createdBy columns to folders table
ALTER TABLE folders ADD COLUMN project_id UUID REFERENCES pm.projects(id) ON DELETE CASCADE;
ALTER TABLE folders ADD COLUMN created_by UUID REFERENCES users(id);

-- Create workspace_pjm table
CREATE TABLE IF NOT EXISTS workspace_pjm (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (workspace_id, user_id)
);

-- Create project_assignments table
CREATE TABLE IF NOT EXISTS project_assignments (
  project_id UUID NOT NULL REFERENCES pm.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('MANAGER', 'MEMBER')),
  PRIMARY KEY (project_id, user_id)
);

-- Create folder_members table
CREATE TABLE IF NOT EXISTS folder_members (
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (folder_id, user_id)
);

-- Add created_by to pm.projects table
ALTER TABLE pm.projects ADD COLUMN created_by UUID REFERENCES users(id);

COMMIT;
