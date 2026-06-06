BEGIN;

INSERT INTO pm.tasks (id, project_id, sheet_id, row_id, name, start_date, end_date, assignee_id, status, is_milestone, is_critical, float_days)
VALUES
  ('ca000001-0000-0000-0000-000000000001',
   'b4f72294-75f0-4e16-b3c9-6993d2926648',
   '90e67146-1dfc-4a76-9577-ea099daf2e4e',
   'bb000001-0000-0000-0000-000000000001',
   'Requirements & Planning',
   '2026-06-01', '2026-06-05',
   'e7616147-3860-4966-9e67-d64e963b57da',
   'Done', false, true, 0),

  ('ca000001-0000-0000-0000-000000000002',
   'b4f72294-75f0-4e16-b3c9-6993d2926648',
   '90e67146-1dfc-4a76-9577-ea099daf2e4e',
   'bb000001-0000-0000-0000-000000000002',
   'System Design',
   '2026-06-06', '2026-06-10',
   'e7616147-3860-4966-9e67-d64e963b57da',
   'Done', false, true, 0),

  ('ca000001-0000-0000-0000-000000000003',
   'b4f72294-75f0-4e16-b3c9-6993d2926648',
   '90e67146-1dfc-4a76-9577-ea099daf2e4e',
   'bb000001-0000-0000-0000-000000000003',
   'Development Sprint 1',
   '2026-06-11', '2026-06-20',
   '7a8593c9-7f1b-4f8d-f694-383ed1ec06ac',
   'In Progress', false, true, 0),

  ('ca000001-0000-0000-0000-000000000004',
   'b4f72294-75f0-4e16-b3c9-6993d2926648',
   '90e67146-1dfc-4a76-9577-ea099daf2e4e',
   'bb000001-0000-0000-0000-000000000004',
   'QA & Testing',
   '2026-06-21', '2026-06-27',
   'bcff92b0-a215-bd8d-6a58-6195661b4cc1',
   'Not Started', false, false, 3),

  ('ca000001-0000-0000-0000-000000000005',
   'b4f72294-75f0-4e16-b3c9-6993d2926648',
   '90e67146-1dfc-4a76-9577-ea099daf2e4e',
   'bb000001-0000-0000-0000-000000000005',
   'Production Deployment',
   '2026-06-28', '2026-06-30',
   'd64e963b-57da-4966-9e67-e76161473860',
   'Not Started', true, true, 0)

ON CONFLICT (sheet_id, row_id) DO NOTHING;

INSERT INTO pm.task_dependencies (id, from_task_id, to_task_id, dependency_type, lag_days)
VALUES
  (gen_random_uuid(), 'ca000001-0000-0000-0000-000000000001', 'ca000001-0000-0000-0000-000000000002', 'FS', 0),
  (gen_random_uuid(), 'ca000001-0000-0000-0000-000000000002', 'ca000001-0000-0000-0000-000000000003', 'FS', 0),
  (gen_random_uuid(), 'ca000001-0000-0000-0000-000000000003', 'ca000001-0000-0000-0000-000000000004', 'FS', 0),
  (gen_random_uuid(), 'ca000001-0000-0000-0000-000000000004', 'ca000001-0000-0000-0000-000000000005', 'FS', 0)
ON CONFLICT DO NOTHING;

UPDATE pm.projects
SET created_by = 'e7616147-3860-4966-9e67-d64e963b57da'
WHERE created_by IS NULL;

INSERT INTO project_assignments (project_id, user_id, role)
VALUES
  ('dafaddfe-c6c7-47cb-b2eb-f0475d236d33', '7a8593c9-7f1b-4f8d-f694-383ed1ec06ac', 'MANAGER'),
  ('dafaddfe-c6c7-47cb-b2eb-f0475d236d33', 'd64e963b-57da-4966-9e67-e76161473860', 'MEMBER'),
  ('b4f72294-75f0-4e16-b3c9-6993d2926648', '7a8593c9-7f1b-4f8d-f694-383ed1ec06ac', 'MANAGER'),
  ('b4f72294-75f0-4e16-b3c9-6993d2926648', 'd64e963b-57da-4966-9e67-e76161473860', 'MEMBER'),
  ('b4f72294-75f0-4e16-b3c9-6993d2926648', 'bcff92b0-a215-bd8d-6a58-6195661b4cc1', 'MEMBER')
ON CONFLICT DO NOTHING;

COMMIT;
