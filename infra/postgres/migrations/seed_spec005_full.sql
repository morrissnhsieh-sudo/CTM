-- Full demo seed (all-or-nothing transaction, valid UUIDs throughout)
BEGIN;

-- ══════════════════════════════════════════════════════════════
-- SHEET 1  (b9ff414f)  →  Kanban / Calendar / Conditional Fmt
-- Columns:
--   Name     347ff4ca
--   Status   60464d85
--   Assignee 1ab8d013
--   Due Date d8b38d10
-- ══════════════════════════════════════════════════════════════

INSERT INTO rows (id, sheet_id, position, created_by) VALUES
  ('aa000001-0000-0000-0000-000000000001','b9ff414f-aa9b-46c1-a7ee-b1c1a754b9f7',0,'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000002','b9ff414f-aa9b-46c1-a7ee-b1c1a754b9f7',1,'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000003','b9ff414f-aa9b-46c1-a7ee-b1c1a754b9f7',2,'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000004','b9ff414f-aa9b-46c1-a7ee-b1c1a754b9f7',3,'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000005','b9ff414f-aa9b-46c1-a7ee-b1c1a754b9f7',4,'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000006','b9ff414f-aa9b-46c1-a7ee-b1c1a754b9f7',5,'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000007','b9ff414f-aa9b-46c1-a7ee-b1c1a754b9f7',6,'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000008','b9ff414f-aa9b-46c1-a7ee-b1c1a754b9f7',7,'e7616147-3860-4966-9e67-d64e963b57da')
ON CONFLICT DO NOTHING;

INSERT INTO cells (row_id, col_id, value, updated_by) VALUES
  ('aa000001-0000-0000-0000-000000000001','347ff4ca-3c48-42a1-82b9-33188b447b0d','Design system architecture',  'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000002','347ff4ca-3c48-42a1-82b9-33188b447b0d','Set up CI/CD pipeline',       'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000003','347ff4ca-3c48-42a1-82b9-33188b447b0d','Implement authentication',    'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000004','347ff4ca-3c48-42a1-82b9-33188b447b0d','Build dashboard UI',          'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000005','347ff4ca-3c48-42a1-82b9-33188b447b0d','Write API documentation',     'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000006','347ff4ca-3c48-42a1-82b9-33188b447b0d','Performance testing',         'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000007','347ff4ca-3c48-42a1-82b9-33188b447b0d','Security audit',              'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000008','347ff4ca-3c48-42a1-82b9-33188b447b0d','Deploy to production',        'e7616147-3860-4966-9e67-d64e963b57da')
ON CONFLICT DO NOTHING;

INSERT INTO cells (row_id, col_id, value, updated_by) VALUES
  ('aa000001-0000-0000-0000-000000000001','60464d85-2436-4f72-99d5-8e26a0a9fb2c','Done',        'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000002','60464d85-2436-4f72-99d5-8e26a0a9fb2c','Done',        'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000003','60464d85-2436-4f72-99d5-8e26a0a9fb2c','In Progress', 'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000004','60464d85-2436-4f72-99d5-8e26a0a9fb2c','In Progress', 'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000005','60464d85-2436-4f72-99d5-8e26a0a9fb2c','Not Started', 'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000006','60464d85-2436-4f72-99d5-8e26a0a9fb2c','Not Started', 'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000007','60464d85-2436-4f72-99d5-8e26a0a9fb2c','Not Started', 'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000008','60464d85-2436-4f72-99d5-8e26a0a9fb2c','Not Started', 'e7616147-3860-4966-9e67-d64e963b57da')
ON CONFLICT DO NOTHING;

INSERT INTO cells (row_id, col_id, value, updated_by) VALUES
  ('aa000001-0000-0000-0000-000000000001','1ab8d013-6948-4d6c-9b30-4e5f2c04a83e','System Admin',   'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000002','1ab8d013-6948-4d6c-9b30-4e5f2c04a83e','System Admin',   'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000003','1ab8d013-6948-4d6c-9b30-4e5f2c04a83e','Project Manager','e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000004','1ab8d013-6948-4d6c-9b30-4e5f2c04a83e','Folder Manager', 'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000005','1ab8d013-6948-4d6c-9b30-4e5f2c04a83e','Folder Manager', 'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000006','1ab8d013-6948-4d6c-9b30-4e5f2c04a83e','Project Member', 'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000007','1ab8d013-6948-4d6c-9b30-4e5f2c04a83e','Project Member', 'e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000008','1ab8d013-6948-4d6c-9b30-4e5f2c04a83e','System Admin',   'e7616147-3860-4966-9e67-d64e963b57da')
ON CONFLICT DO NOTHING;

INSERT INTO cells (row_id, col_id, value, updated_by) VALUES
  ('aa000001-0000-0000-0000-000000000001','d8b38d10-34b6-411f-8c04-c72ed41e8886','2026-06-02','e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000002','d8b38d10-34b6-411f-8c04-c72ed41e8886','2026-06-05','e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000003','d8b38d10-34b6-411f-8c04-c72ed41e8886','2026-06-10','e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000004','d8b38d10-34b6-411f-8c04-c72ed41e8886','2026-06-10','e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000005','d8b38d10-34b6-411f-8c04-c72ed41e8886','2026-06-15','e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000006','d8b38d10-34b6-411f-8c04-c72ed41e8886','2026-06-18','e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000007','d8b38d10-34b6-411f-8c04-c72ed41e8886','2026-06-22','e7616147-3860-4966-9e67-d64e963b57da'),
  ('aa000001-0000-0000-0000-000000000008','d8b38d10-34b6-411f-8c04-c72ed41e8886','2026-06-30','e7616147-3860-4966-9e67-d64e963b57da')
ON CONFLICT DO NOTHING;

-- Conditional formatting rules on Sheet 1
UPDATE sheets
SET settings = jsonb_set(COALESCE(settings,'{}'),'{conditionalFormatRules}',
  '[{"id":"rule-done","colId":"60464d85-2436-4f72-99d5-8e26a0a9fb2c","condition":"equals","value":"Done","applyToRow":true,"style":{"fontColor":"#10b981","strikethrough":true}},{"id":"rule-inprogress","colId":"60464d85-2436-4f72-99d5-8e26a0a9fb2c","condition":"equals","value":"In Progress","applyToRow":true,"style":{"bgColor":"#fef3c7","bold":true}},{"id":"rule-notstarted","colId":"60464d85-2436-4f72-99d5-8e26a0a9fb2c","condition":"equals","value":"Not Started","applyToRow":true,"style":{"fontColor":"#9ca3af"}}]'::jsonb)
WHERE id = 'b9ff414f-aa9b-46c1-a7ee-b1c1a754b9f7';

-- Discussion on Sheet 1
INSERT INTO discussions (id, workspace_id, sheet_id, title, author_id, body, resolved)
VALUES (
  'dd000001-0000-0000-0000-000000000001',
  (SELECT workspace_id FROM sheets WHERE id = 'b9ff414f-aa9b-46c1-a7ee-b1c1a754b9f7'),
  'b9ff414f-aa9b-46c1-a7ee-b1c1a754b9f7',
  'Sprint kick-off notes',
  'e7616147-3860-4966-9e67-d64e963b57da',
  'Architecture and CI/CD are complete. Authentication is in progress. All remaining tasks queued for assignment.',
  false
) ON CONFLICT DO NOTHING;

INSERT INTO discussion_comments (id, discussion_id, author_id, body)
VALUES (
  'dc000001-0000-0000-0000-000000000001',
  'dd000001-0000-0000-0000-000000000001',
  '7a8593c9-7f1b-4f8d-f694-383ed1ec06ac',
  'I will pick up the dashboard UI task once authentication lands.'
) ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- SHEET1-1-1  (90e67146)  →  Gantt / PM Tasks / Dependencies
-- Columns:
--   Name     3e44cddc
--   Status   b824716c
--   Assignee a4c62930
--   Due Date 2b52c64f
-- ══════════════════════════════════════════════════════════════

INSERT INTO rows (id, sheet_id, position, created_by) VALUES
  ('bb000001-0000-0000-0000-000000000001','90e67146-1dfc-4a76-9577-ea099daf2e4e',0,'e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000002','90e67146-1dfc-4a76-9577-ea099daf2e4e',1,'e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000003','90e67146-1dfc-4a76-9577-ea099daf2e4e',2,'e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000004','90e67146-1dfc-4a76-9577-ea099daf2e4e',3,'e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000005','90e67146-1dfc-4a76-9577-ea099daf2e4e',4,'e7616147-3860-4966-9e67-d64e963b57da')
ON CONFLICT DO NOTHING;

INSERT INTO cells (row_id, col_id, value, updated_by) VALUES
  ('bb000001-0000-0000-0000-000000000001','3e44cddc-24db-47f3-bafe-f7468848b4af','Requirements & Planning','e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000002','3e44cddc-24db-47f3-bafe-f7468848b4af','System Design',          'e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000003','3e44cddc-24db-47f3-bafe-f7468848b4af','Development Sprint 1',   'e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000004','3e44cddc-24db-47f3-bafe-f7468848b4af','QA & Testing',           'e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000005','3e44cddc-24db-47f3-bafe-f7468848b4af','Production Deployment',  'e7616147-3860-4966-9e67-d64e963b57da')
ON CONFLICT DO NOTHING;

INSERT INTO cells (row_id, col_id, value, updated_by) VALUES
  ('bb000001-0000-0000-0000-000000000001','b824716c-57d1-46f5-837f-17d8e9c92e5a','Done',        'e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000002','b824716c-57d1-46f5-837f-17d8e9c92e5a','Done',        'e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000003','b824716c-57d1-46f5-837f-17d8e9c92e5a','In Progress', 'e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000004','b824716c-57d1-46f5-837f-17d8e9c92e5a','Not Started', 'e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000005','b824716c-57d1-46f5-837f-17d8e9c92e5a','Not Started', 'e7616147-3860-4966-9e67-d64e963b57da')
ON CONFLICT DO NOTHING;

INSERT INTO cells (row_id, col_id, value, updated_by) VALUES
  ('bb000001-0000-0000-0000-000000000001','a4c62930-2c22-4a66-9adc-6f807549fd09','System Admin',   'e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000002','a4c62930-2c22-4a66-9adc-6f807549fd09','System Admin',   'e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000003','a4c62930-2c22-4a66-9adc-6f807549fd09','Project Manager','e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000004','a4c62930-2c22-4a66-9adc-6f807549fd09','Folder Manager', 'e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000005','a4c62930-2c22-4a66-9adc-6f807549fd09','Project Member', 'e7616147-3860-4966-9e67-d64e963b57da')
ON CONFLICT DO NOTHING;

INSERT INTO cells (row_id, col_id, value, updated_by) VALUES
  ('bb000001-0000-0000-0000-000000000001','2b52c64f-09a3-465a-80ed-ab48e26e38d5','2026-06-05','e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000002','2b52c64f-09a3-465a-80ed-ab48e26e38d5','2026-06-10','e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000003','2b52c64f-09a3-465a-80ed-ab48e26e38d5','2026-06-20','e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000004','2b52c64f-09a3-465a-80ed-ab48e26e38d5','2026-06-27','e7616147-3860-4966-9e67-d64e963b57da'),
  ('bb000001-0000-0000-0000-000000000005','2b52c64f-09a3-465a-80ed-ab48e26e38d5','2026-06-30','e7616147-3860-4966-9e67-d64e963b57da')
ON CONFLICT DO NOTHING;

-- PM tasks (linked to Sheet1-1-1 rows)
INSERT INTO pm.tasks (id, project_id, sheet_id, row_id, name, start_date, end_date, assignee_id, status, is_milestone, is_critical, float_days)
VALUES
  ('ca000001-0000-0000-0000-000000000001','b4f72294-75f0-4e16-b3c9-6993d2926648','90e67146-1dfc-4a76-9577-ea099daf2e4e','bb000001-0000-0000-0000-000000000001','Requirements & Planning','2026-06-01','2026-06-05','e7616147-3860-4966-9e67-d64e963b57da','Done',       false, true,  0),
  ('ca000001-0000-0000-0000-000000000002','b4f72294-75f0-4e16-b3c9-6993d2926648','90e67146-1dfc-4a76-9577-ea099daf2e4e','bb000001-0000-0000-0000-000000000002','System Design',          '2026-06-06','2026-06-10','e7616147-3860-4966-9e67-d64e963b57da','Done',       false, true,  0),
  ('ca000001-0000-0000-0000-000000000003','b4f72294-75f0-4e16-b3c9-6993d2926648','90e67146-1dfc-4a76-9577-ea099daf2e4e','bb000001-0000-0000-0000-000000000003','Development Sprint 1',   '2026-06-11','2026-06-20','7a8593c9-7f1b-4f8d-f694-383ed1ec06ac','In Progress',false, true,  0),
  ('ca000001-0000-0000-0000-000000000004','b4f72294-75f0-4e16-b3c9-6993d2926648','90e67146-1dfc-4a76-9577-ea099daf2e4e','bb000001-0000-0000-0000-000000000004','QA & Testing',           '2026-06-21','2026-06-27','bcff92b0-a215-bd8d-6a58-6195661b4cc1','Not Started',false, false, 3),
  ('ca000001-0000-0000-0000-000000000005','b4f72294-75f0-4e16-b3c9-6993d2926648','90e67146-1dfc-4a76-9577-ea099daf2e4e','bb000001-0000-0000-0000-000000000005','Production Deployment',  '2026-06-28','2026-06-30','d64e963b-57da-4966-9e67-e76161473860','Not Started',true,  true,  0)
ON CONFLICT (sheet_id, row_id) DO NOTHING;

-- Task dependencies (FS chain: 1→2→3→4→5)
INSERT INTO pm.task_dependencies (id, from_task_id, to_task_id, dependency_type, lag_days)
VALUES
  (gen_random_uuid(),'ca000001-0000-0000-0000-000000000001','ca000001-0000-0000-0000-000000000002','FS',0),
  (gen_random_uuid(),'ca000001-0000-0000-0000-000000000002','ca000001-0000-0000-0000-000000000003','FS',0),
  (gen_random_uuid(),'ca000001-0000-0000-0000-000000000003','ca000001-0000-0000-0000-000000000004','FS',0),
  (gen_random_uuid(),'ca000001-0000-0000-0000-000000000004','ca000001-0000-0000-0000-000000000005','FS',0)
ON CONFLICT DO NOTHING;

-- Fix any projects with NULL created_by
UPDATE pm.projects SET created_by = 'e7616147-3860-4966-9e67-d64e963b57da' WHERE created_by IS NULL;

-- Project assignments
INSERT INTO project_assignments (project_id, user_id, role) VALUES
  ('dafaddfe-c6c7-47cb-b2eb-f0475d236d33','7a8593c9-7f1b-4f8d-f694-383ed1ec06ac','MANAGER'),
  ('dafaddfe-c6c7-47cb-b2eb-f0475d236d33','d64e963b-57da-4966-9e67-e76161473860','MEMBER'),
  ('b4f72294-75f0-4e16-b3c9-6993d2926648','7a8593c9-7f1b-4f8d-f694-383ed1ec06ac','MANAGER'),
  ('b4f72294-75f0-4e16-b3c9-6993d2926648','d64e963b-57da-4966-9e67-e76161473860','MEMBER'),
  ('b4f72294-75f0-4e16-b3c9-6993d2926648','bcff92b0-a215-bd8d-6a58-6195661b4cc1','MEMBER')
ON CONFLICT DO NOTHING;

COMMIT;
