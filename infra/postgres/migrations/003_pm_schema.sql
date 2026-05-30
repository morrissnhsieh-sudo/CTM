-- ============================================================
-- CTM Platform — Migration 003: Project Management Schema (M5)
-- ============================================================

BEGIN;

-- ─── Projects ───────────────────────────────────────────────
CREATE TABLE pm.projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  start_date      DATE,
  end_date        DATE,
  settings        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON pm.projects(workspace_id);

-- Now we can add the FK from sheets to projects
ALTER TABLE sheets
  ADD CONSTRAINT fk_sheets_project
  FOREIGN KEY (project_id) REFERENCES pm.projects(id) ON DELETE SET NULL;

-- ─── Tasks (index of PM-enabled rows) ───────────────────────
CREATE TABLE pm.tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES pm.projects(id) ON DELETE CASCADE,
  sheet_id        UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  row_id          UUID NOT NULL REFERENCES rows(id) ON DELETE CASCADE,
  name            TEXT,
  start_date      DATE,
  end_date        DATE,
  duration_days   INT GENERATED ALWAYS AS (
                    CASE WHEN end_date IS NOT NULL AND start_date IS NOT NULL
                    THEN end_date - start_date ELSE NULL END
                  ) STORED,
  assignee_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  status          TEXT,
  is_milestone    BOOLEAN NOT NULL DEFAULT FALSE,
  is_critical     BOOLEAN NOT NULL DEFAULT FALSE,
  float_days      INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (sheet_id, row_id)
);

CREATE INDEX ON pm.tasks(project_id) WHERE deleted_at IS NULL;
CREATE INDEX ON pm.tasks(sheet_id) WHERE deleted_at IS NULL;
CREATE INDEX ON pm.tasks(assignee_id) WHERE assignee_id IS NOT NULL;

-- ─── Task Dependencies ──────────────────────────────────────
CREATE TABLE pm.task_dependencies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_task_id    UUID NOT NULL REFERENCES pm.tasks(id) ON DELETE CASCADE,
  to_task_id      UUID NOT NULL REFERENCES pm.tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL CHECK (dependency_type IN ('FS','SS','FF','SF')),
  lag_days        INT NOT NULL DEFAULT 0,
  UNIQUE (from_task_id, to_task_id)
);

CREATE INDEX ON pm.task_dependencies(from_task_id);
CREATE INDEX ON pm.task_dependencies(to_task_id);

-- ─── Baselines ──────────────────────────────────────────────
CREATE TABLE pm.baselines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES pm.projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT 'Baseline',
  snapshot        JSONB NOT NULL,  -- task schedule snapshot
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Approvals ──────────────────────────────────────────────
CREATE TABLE pm.approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id          UUID NOT NULL REFERENCES rows(id) ON DELETE CASCADE,
  sheet_id        UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  workflow_def    JSONB NOT NULL,
  current_state   TEXT NOT NULL DEFAULT 'DRAFT'
                    CHECK (current_state IN ('DRAFT','PENDING','IN_REVIEW','APPROVED','REJECTED','ESCALATED')),
  history         JSONB[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON pm.approvals(row_id);
CREATE INDEX ON pm.approvals(sheet_id, current_state);

-- ─── Workflow Triggers ──────────────────────────────────────
CREATE TABLE pm.workflow_triggers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id        UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL CHECK (event_type IN (
                    'row_created','row_updated','status_changed',
                    'date_reached','approval_completed','webhook_received'
                  )),
  conditions      TEXT NOT NULL DEFAULT 'true',  -- go-expr expression
  actions         JSONB NOT NULL DEFAULT '[]',
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  last_fired_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON pm.workflow_triggers(sheet_id) WHERE enabled = TRUE;

-- ─── Time Tracking ──────────────────────────────────────────
CREATE TABLE pm.time_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id          UUID NOT NULL REFERENCES rows(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  duration_seconds INT GENERATED ALWAYS AS (
                    CASE WHEN ended_at IS NOT NULL
                    THEN EXTRACT(EPOCH FROM (ended_at - started_at))::INT
                    ELSE NULL END
                  ) STORED,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON pm.time_entries(row_id);
CREATE INDEX ON pm.time_entries(user_id);

COMMIT;
