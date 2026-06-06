-- infra/postgres/migrations/017_public_sharing_rls.sql

BEGIN;

-- Allow public access to sharing records with a public_token
DROP POLICY IF EXISTS sharing_public_select ON sharing;
CREATE POLICY sharing_public_select ON sharing
  FOR SELECT
  TO public
  USING (public_token IS NOT NULL);

-- Allow public access to sheets that have public sharing enabled
DROP POLICY IF EXISTS sheets_public_select ON sheets;
CREATE POLICY sheets_public_select ON sheets
  FOR SELECT
  TO public
  USING (id IN (
    SELECT resource_id FROM sharing 
    WHERE resource_type = 'sheet' 
      AND principal_type = 'public' 
      AND public_token IS NOT NULL
      AND (expires_at IS NULL OR expires_at > NOW())
  ));

-- Allow public access to columns of publicly shared sheets
DROP POLICY IF EXISTS columns_public_select ON columns;
CREATE POLICY columns_public_select ON columns
  FOR SELECT
  TO public
  USING (sheet_id IN (
    SELECT resource_id FROM sharing 
    WHERE resource_type = 'sheet' 
      AND principal_type = 'public' 
      AND public_token IS NOT NULL
      AND (expires_at IS NULL OR expires_at > NOW())
  ));

-- Allow public access to rows of publicly shared sheets
DROP POLICY IF EXISTS rows_public_select ON rows;
CREATE POLICY rows_public_select ON rows
  FOR SELECT
  TO public
  USING (sheet_id IN (
    SELECT resource_id FROM sharing 
    WHERE resource_type = 'sheet' 
      AND principal_type = 'public' 
      AND public_token IS NOT NULL
      AND (expires_at IS NULL OR expires_at > NOW())
  ));

-- Allow public access to cells of publicly shared sheets
DROP POLICY IF EXISTS cells_public_select ON cells;
CREATE POLICY cells_public_select ON cells
  FOR SELECT
  TO public
  USING (row_id IN (
    SELECT r.id FROM rows r
    WHERE r.sheet_id IN (
      SELECT resource_id FROM sharing 
      WHERE resource_type = 'sheet' 
        AND principal_type = 'public' 
        AND public_token IS NOT NULL
        AND (expires_at IS NULL OR expires_at > NOW())
    )
  ));

COMMIT;
