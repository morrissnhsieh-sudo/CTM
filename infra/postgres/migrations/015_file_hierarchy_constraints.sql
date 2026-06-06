-- Migration 015: File hierarchy constraints
-- Implements SPEC-003 gaps G-1, G-2, G-4:
--   G-1: sheets.project_id must NOT be NULL
--   G-2: folders.project_id must NOT be NULL
--   G-4: sheets must have an explicit type column

-- ─── Step 1: Add file type column to sheets ───────────────────────────────────
ALTER TABLE sheets
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'SPREADSHEET'
  CHECK (type IN ('SPREADSHEET', 'GRID', 'TEMPLATE', 'FORM', 'DASHBOARD'));

-- ─── Step 2: Create "General" project for each workspace that has orphans ─────
-- Orphan = a sheet or folder whose project_id is NULL.
INSERT INTO pm.projects (id, workspace_id, name, status, created_by, created_at)
SELECT
  gen_random_uuid(),
  w.id,
  'General',
  'active',
  w.owner_id,
  NOW()
FROM workspaces w
WHERE
  (EXISTS (SELECT 1 FROM sheets   s WHERE s.workspace_id = w.id AND s.project_id IS NULL))
  OR
  (EXISTS (SELECT 1 FROM folders  f WHERE f.workspace_id = w.id AND f.project_id IS NULL))
ON CONFLICT DO NOTHING;

-- ─── Step 3: Assign orphaned sheets to the General project ────────────────────
UPDATE sheets s
SET project_id = p.id
FROM pm.projects p
WHERE p.workspace_id = s.workspace_id
  AND p.name = 'General'
  AND s.project_id IS NULL;

-- ─── Step 4: Assign orphaned folders to the General project ───────────────────
UPDATE folders f
SET project_id = p.id
FROM pm.projects p
WHERE p.workspace_id = f.workspace_id
  AND p.name = 'General'
  AND f.project_id IS NULL;

-- ─── Step 5: Enforce NOT NULL now that all rows have a project_id ─────────────
ALTER TABLE sheets  ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE folders ALTER COLUMN project_id SET NOT NULL;
