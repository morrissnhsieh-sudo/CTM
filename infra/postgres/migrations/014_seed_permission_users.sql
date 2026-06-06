BEGIN;

-- Insert PjM
INSERT INTO users (id, workspace_id, email, password_hash, name, role)
VALUES (
  '7a8593c9-7f1b-4f8d-f694-383ed1ec06ac',
  '263fcc2a-9f41-4097-ad7d-4090c1896940',
  'pjm@ctm.app',
  '4ef6e56e7d873e1b2b0d6aca6fdacd3a:aa5d7fc570538b3301ed771c47eb94132c83cce92ddd0b26442585873415fa81722f65058039b0f727310d3d40eb96a331a540017e444189977636964658912f',
  'Project Manager',
  'EDITOR'
) ON CONFLICT (workspace_id, email) DO UPDATE
SET password_hash = EXCLUDED.password_hash;

-- Insert Manager
INSERT INTO users (id, workspace_id, email, password_hash, name, role)
VALUES (
  'bcff92b0-a215-bd8d-6a58-6195661b4cc1',
  '263fcc2a-9f41-4097-ad7d-4090c1896940',
  'manager@ctm.app',
  '1263b1a40941bbe98d4757a68acb4538:9876db42038d8580e8a9ad9ccf1393a982696c3b1246531da0989280b52616cc6399ca6cded103182dde18e0dcf64db6e63574bb6dacd5ac6b6b66955c0ccbf2',
  'Folder Manager',
  'EDITOR'
) ON CONFLICT (workspace_id, email) DO UPDATE
SET password_hash = EXCLUDED.password_hash;

-- Insert Member
INSERT INTO users (id, workspace_id, email, password_hash, name, role)
VALUES (
  'd64e963b-57da-4966-9e67-e76161473860',
  '263fcc2a-9f41-4097-ad7d-4090c1896940',
  'member@ctm.app',
  '1cb1d748273680f244addea51bb13f72:3f6deeae1500402f0bd7c784a259d7da8f7ec605bf8a8217d9bde73980dd4712977aa4b51b5391d6edbc82dff7d2de0637f25c170f5f040452133fa0010dbfe9',
  'Project Member',
  'EDITOR'
) ON CONFLICT (workspace_id, email) DO UPDATE
SET password_hash = EXCLUDED.password_hash;

-- Seed Workspace PjM mapping
INSERT INTO workspace_pjm (workspace_id, user_id)
VALUES ('263fcc2a-9f41-4097-ad7d-4090c1896940', '7a8593c9-7f1b-4f8d-f694-383ed1ec06ac')
ON CONFLICT DO NOTHING;

COMMIT;
