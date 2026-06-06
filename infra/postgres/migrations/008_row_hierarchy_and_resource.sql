BEGIN;

-- Add row hierarchy columns to rows if not already present
ALTER TABLE rows ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES rows(id) ON DELETE CASCADE;
ALTER TABLE rows ADD COLUMN IF NOT EXISTS expanded BOOLEAN NOT NULL DEFAULT TRUE;

-- Create resource allocations table
CREATE TABLE IF NOT EXISTS pm.resource_allocations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES pm.projects(id) ON DELETE CASCADE,
  allocation_percent INT NOT NULL CHECK (allocation_percent >= 0 AND allocation_percent <= 100),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resource_allocations_resource_idx ON pm.resource_allocations(resource_id);
CREATE INDEX IF NOT EXISTS resource_allocations_project_idx ON pm.resource_allocations(project_id);

COMMIT;
