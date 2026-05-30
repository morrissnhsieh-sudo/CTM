-- ============================================================
-- M9 — Database & Storage
-- Schema constraint tests: FK, CHECK, UNIQUE, NOT NULL
--
-- Spec refs:
--   - cells: composite PK (row_id, col_id)
--   - columns: position UNIQUE per sheet
--   - users: email UNIQUE per workspace
--   - role CHECK: OWNER|ADMIN|EDITOR|COMMENTER|VIEWER
--   - sheets.plan CHECK: free|pro|business|enterprise
-- ============================================================

\set ON_ERROR_STOP on
\echo '--- M9 Schema Constraint Tests ---'

-- ── Test: role CHECK constraint ───────────────────────────────────────────────
DO $$
DECLARE
    ws_id UUID := gen_random_uuid();
    user_id UUID := gen_random_uuid();
BEGIN
    INSERT INTO workspaces (id, name, owner_id) VALUES (ws_id, 'Test', user_id);
    INSERT INTO users (id, workspace_id, email, name, role)
    VALUES (user_id, ws_id, 'valid@test.com', 'Test User', 'EDITOR');
    RAISE NOTICE 'PASS: Valid role EDITOR accepted';
    DELETE FROM users WHERE id = user_id;
    DELETE FROM workspaces WHERE id = ws_id;
END $$;

DO $$
DECLARE
    ws_id UUID := gen_random_uuid();
    user_id UUID := gen_random_uuid();
BEGIN
    INSERT INTO workspaces (id, name, owner_id) VALUES (ws_id, 'Test', user_id);
    BEGIN
        INSERT INTO users (id, workspace_id, email, name, role)
        VALUES (gen_random_uuid(), ws_id, 'test@test.com', 'Test', 'SUPERADMIN');
        RAISE EXCEPTION 'TEST FAILED: Invalid role SUPERADMIN should have been rejected';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS: Invalid role SUPERADMIN rejected by CHECK constraint';
    END;
    DELETE FROM workspaces WHERE id = ws_id;
END $$;

-- ── Test: workspace plan CHECK constraint ─────────────────────────────────────
DO $$
DECLARE
    ws_id UUID := gen_random_uuid();
    owner_id UUID := gen_random_uuid();
BEGIN
    BEGIN
        INSERT INTO workspaces (id, name, owner_id, plan)
        VALUES (ws_id, 'Test', owner_id, 'platinum');
        RAISE EXCEPTION 'TEST FAILED: Invalid plan platinum should have been rejected';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS: Invalid plan platinum rejected by CHECK constraint';
    END;
END $$;

-- ── Test: users email UNIQUE per workspace ────────────────────────────────────
DO $$
DECLARE
    ws_id UUID := gen_random_uuid();
    owner_id UUID := gen_random_uuid();
BEGIN
    INSERT INTO workspaces (id, name, owner_id) VALUES (ws_id, 'Test', owner_id);
    INSERT INTO users (id, workspace_id, email, name, role)
    VALUES (owner_id, ws_id, 'dup@test.com', 'First', 'OWNER');
    BEGIN
        INSERT INTO users (id, workspace_id, email, name, role)
        VALUES (gen_random_uuid(), ws_id, 'dup@test.com', 'Second', 'EDITOR');
        RAISE EXCEPTION 'TEST FAILED: Duplicate email in same workspace should be rejected';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS: Duplicate email in same workspace rejected by UNIQUE constraint';
    END;
    DELETE FROM users WHERE workspace_id = ws_id;
    DELETE FROM workspaces WHERE id = ws_id;
END $$;

-- ── Test: cells composite PK ─────────────────────────────────────────────────
DO $$
DECLARE
    ws_id UUID := gen_random_uuid();
    owner_id UUID := gen_random_uuid();
    sheet_id UUID := gen_random_uuid();
    row_id UUID := gen_random_uuid();
    col_id UUID := gen_random_uuid();
BEGIN
    INSERT INTO workspaces (id, name, owner_id) VALUES (ws_id, 'Test', owner_id);
    INSERT INTO users (id, workspace_id, email, name, role)
    VALUES (owner_id, ws_id, 'owner@test.com', 'Owner', 'OWNER');
    INSERT INTO sheets (id, workspace_id, title, created_by)
    VALUES (sheet_id, ws_id, 'Test Sheet', owner_id);
    INSERT INTO columns (id, sheet_id, name, type, position)
    VALUES (col_id, sheet_id, 'Col1', 'text', 0);
    INSERT INTO rows (id, sheet_id, position, created_by)
    VALUES (row_id, sheet_id, 0, owner_id);
    INSERT INTO cells (row_id, col_id, value, updated_by)
    VALUES (row_id, col_id, 'first', owner_id);

    BEGIN
        INSERT INTO cells (row_id, col_id, value, updated_by)
        VALUES (row_id, col_id, 'duplicate', owner_id);
        RAISE EXCEPTION 'TEST FAILED: Duplicate (row_id, col_id) should be rejected';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS: cells composite PK (row_id, col_id) enforced';
    END;

    -- Cleanup
    DELETE FROM cells WHERE row_id = row_id;
    DELETE FROM rows WHERE id = row_id;
    DELETE FROM columns WHERE id = col_id;
    DELETE FROM sheets WHERE id = sheet_id;
    DELETE FROM users WHERE id = owner_id;
    DELETE FROM workspaces WHERE id = ws_id;
END $$;

\echo '--- M9 Schema Constraint Tests Complete ---'
