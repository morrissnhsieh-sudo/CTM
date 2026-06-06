BEGIN;

-- Seed default workspaces if not exists, but we know 263fcc2a-9f41-4097-ad7d-4090c1896940 is there or we can insert if not exists
INSERT INTO workspaces (id, name, owner_id)
VALUES ('263fcc2a-9f41-4097-ad7d-4090c1896940', 'Demo User''s workspace', '6a586195-661b-4cc1-bcff-92b0a215bd8d')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, workspace_id, email, password_hash, name, role)
VALUES ('e7616147-3860-4966-9e67-d64e963b57da', '263fcc2a-9f41-4097-ad7d-4090c1896940', 'admin@ctm.app', 'ca340e6e40a8c9650f579678867779a4:2c461b927a8593c97f1b4f8df694383ed1ec06ac1f7caf28d4c923ac59869310e0f2960a461980dc76aaa0ae4def148be8cbb1c0de92e4eb432fdf061578790e', 'System Admin', 'ADMIN')
ON CONFLICT (workspace_id, email) DO UPDATE
SET password_hash = EXCLUDED.password_hash, role = 'ADMIN';

COMMIT;
