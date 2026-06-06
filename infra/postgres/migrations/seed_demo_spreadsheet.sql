-- ============================================================
-- Demo Spreadsheet: "Product Catalog" under Project 1
-- Workspace: 263fcc2a  (Demo User's workspace)
-- Project:   b4f72294  (Project 1)
-- Sheet:     ee000001  (new)
-- ============================================================
-- Demonstrates:
--   • 11 column types (text, number, currency, date, dropdown,
--     checkbox, contact, url, auto_number, formula-ready)
--   • Column type validation (required, min, allowedValues)
--   • Column ordering via position field
--   • Conditional formatting rules
--   • Discussion thread with reply (Conversations)
--   • Worksheet-scope attachment (imported Excel file)
-- ============================================================

BEGIN;

-- ── 1. Sheet ─────────────────────────────────────────────────────────────────
INSERT INTO sheets (id, workspace_id, project_id, title, type, description, created_by, settings)
VALUES (
  'ee000001-0000-0000-0000-000000000001',
  '263fcc2a-9f41-4097-ad7d-4090c1896940',
  'b4f72294-75f0-4e16-b3c9-6993d2926648',
  'Product Catalog',
  'SPREADSHEET',
  'Full product inventory — demonstrates all CTM column types, validation, conditional formatting, conversations and attachments.',
  '6a586195-661b-4cc1-bcff-92b0a215bd8d',
  '{
    "defaultRowHeight": 36,
    "frozenRows": 0,
    "frozenCols": 0,
    "theme": "default",
    "conditionalFormatRules": [
      {
        "id": "cf-discontinued",
        "colId": "f0000001-0000-0000-0000-000000000010",
        "condition": "equals",
        "value": "Discontinued",
        "applyToRow": true,
        "style": { "fontColor": "#9ca3af", "strikethrough": true }
      },
      {
        "id": "cf-active",
        "colId": "f0000001-0000-0000-0000-000000000010",
        "condition": "equals",
        "value": "Active",
        "applyToRow": false,
        "style": { "fontColor": "#10b981", "bold": true }
      },
      {
        "id": "cf-draft",
        "colId": "f0000001-0000-0000-0000-000000000010",
        "condition": "equals",
        "value": "Draft",
        "applyToRow": false,
        "style": { "fontColor": "#f59e0b" }
      },
      {
        "id": "cf-out-of-stock",
        "colId": "f0000001-0000-0000-0000-000000000007",
        "condition": "equals",
        "value": "false",
        "applyToRow": true,
        "style": { "bgColor": "#fef2f2" }
      }
    ]
  }'::jsonb
)
ON CONFLICT DO NOTHING;

-- ── 2. Columns (11 types — matching SPEC-005 §3.2) ───────────────────────────
INSERT INTO columns (id, sheet_id, name, type, position, width, frozen, hidden, format, validation)
VALUES
  -- Col 0: Auto-incrementing row ID (like Excel row number)
  ('f0000001-0000-0000-0000-000000000001',
   'ee000001-0000-0000-0000-000000000001',
   'ID', 'auto_number', 0, 72, true, false,
   '{}'::jsonb, NULL),

  -- Col 1: Primary text — Product Name (required)
  ('f0000001-0000-0000-0000-000000000002',
   'ee000001-0000-0000-0000-000000000001',
   'Product Name', 'text', 1, 220, false, false,
   '{}'::jsonb,
   '{"required": true, "errorMessage": "Product name is required"}'::jsonb),

  -- Col 2: SKU code
  ('f0000001-0000-0000-0000-000000000003',
   'ee000001-0000-0000-0000-000000000001',
   'SKU', 'text', 2, 120, false, false,
   '{}'::jsonb, NULL),

  -- Col 3: Category dropdown (5 options with colours)
  ('f0000001-0000-0000-0000-000000000004',
   'ee000001-0000-0000-0000-000000000001',
   'Category', 'dropdown', 3, 150, false, false,
   '{"dropdownOptions": [
       {"label": "Electronics", "color": "#3B82F6"},
       {"label": "Clothing",    "color": "#EC4899"},
       {"label": "Books",       "color": "#F59E0B"},
       {"label": "Software",    "color": "#8B5CF6"},
       {"label": "Food",        "color": "#10B981"}
   ]}'::jsonb,
   '{"allowedValues": ["Electronics","Clothing","Books","Software","Food"],
     "errorMessage": "Choose a valid category"}'::jsonb),

  -- Col 4: Currency — Unit Price
  ('f0000001-0000-0000-0000-000000000005',
   'ee000001-0000-0000-0000-000000000001',
   'Unit Price', 'currency', 4, 130, false, false,
   '{"currencySymbol": "$", "decimalPlaces": 2}'::jsonb,
   '{"min": 0, "errorMessage": "Price must be ≥ 0"}'::jsonb),

  -- Col 5: Number — Quantity on Hand
  ('f0000001-0000-0000-0000-000000000006',
   'ee000001-0000-0000-0000-000000000001',
   'Qty on Hand', 'number', 5, 120, false, false,
   '{"decimalPlaces": 0}'::jsonb,
   '{"min": 0, "errorMessage": "Quantity cannot be negative"}'::jsonb),

  -- Col 6: Checkbox — In Stock flag
  ('f0000001-0000-0000-0000-000000000007',
   'ee000001-0000-0000-0000-000000000001',
   'In Stock', 'checkbox', 6, 100, false, false,
   '{}'::jsonb, NULL),

  -- Col 7: Date — Launch Date
  ('f0000001-0000-0000-0000-000000000008',
   'ee000001-0000-0000-0000-000000000001',
   'Launch Date', 'date', 7, 130, false, false,
   '{"dateFormat": "YYYY-MM-DD"}'::jsonb, NULL),

  -- Col 8: Contact — Owner (workspace user)
  ('f0000001-0000-0000-0000-000000000009',
   'ee000001-0000-0000-0000-000000000001',
   'Owner', 'contact', 8, 160, false, false,
   '{}'::jsonb,
   '{"errorMessage": "Must be a valid workspace member"}'::jsonb),

  -- Col 9: Dropdown — Status (with colour coding)
  ('f0000001-0000-0000-0000-000000000010',
   'ee000001-0000-0000-0000-000000000001',
   'Status', 'dropdown', 9, 140, false, false,
   '{"dropdownOptions": [
       {"label": "Draft",        "color": "#F59E0B"},
       {"label": "Active",       "color": "#10B981"},
       {"label": "Discontinued", "color": "#EF4444"}
   ]}'::jsonb,
   '{"allowedValues": ["Draft","Active","Discontinued"],
     "errorMessage": "Choose Draft, Active or Discontinued"}'::jsonb),

  -- Col 10: URL — Product Page
  ('f0000001-0000-0000-0000-000000000011',
   'ee000001-0000-0000-0000-000000000001',
   'Product URL', 'url', 10, 220, false, false,
   '{}'::jsonb, NULL)

ON CONFLICT DO NOTHING;

-- ── 3. Rows (10 products) ─────────────────────────────────────────────────────
INSERT INTO rows (id, sheet_id, position, created_by) VALUES
  ('e1000001-0000-0000-0000-000000000001','ee000001-0000-0000-0000-000000000001',0,'6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000002','ee000001-0000-0000-0000-000000000001',1,'6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000003','ee000001-0000-0000-0000-000000000001',2,'6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000004','ee000001-0000-0000-0000-000000000001',3,'6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000005','ee000001-0000-0000-0000-000000000001',4,'6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000006','ee000001-0000-0000-0000-000000000001',5,'6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000007','ee000001-0000-0000-0000-000000000001',6,'6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000008','ee000001-0000-0000-0000-000000000001',7,'6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000009','ee000001-0000-0000-0000-000000000001',8,'6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000010','ee000001-0000-0000-0000-000000000001',9,'6a586195-661b-4cc1-bcff-92b0a215bd8d')
ON CONFLICT DO NOTHING;

-- ── 4. Cells ──────────────────────────────────────────────────────────────────
-- Layout: col f..001=ID  f..002=Name  f..003=SKU  f..004=Category
--         f..005=Price   f..006=Qty   f..007=InStock  f..008=Date
--         f..009=Owner   f..010=Status  f..011=URL

-- Row 0: iPhone 15 Pro
INSERT INTO cells (row_id,col_id,value,updated_by) VALUES
  ('e1000001-0000-0000-0000-000000000001','f0000001-0000-0000-0000-000000000001','1',  '6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000001','f0000001-0000-0000-0000-000000000002','iPhone 15 Pro','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000001','f0000001-0000-0000-0000-000000000003','SKU-0001','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000001','f0000001-0000-0000-0000-000000000004','Electronics','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000001','f0000001-0000-0000-0000-000000000005','999.00','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000001','f0000001-0000-0000-0000-000000000006','150','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000001','f0000001-0000-0000-0000-000000000007','true','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000001','f0000001-0000-0000-0000-000000000008','2023-09-22','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000001','f0000001-0000-0000-0000-000000000009','Demo User','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000001','f0000001-0000-0000-0000-000000000010','Active','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000001','f0000001-0000-0000-0000-000000000011','https://apple.com/iphone-15-pro','6a586195-661b-4cc1-bcff-92b0a215bd8d')
ON CONFLICT DO NOTHING;

-- Row 1: MacBook Air M3
INSERT INTO cells (row_id,col_id,value,updated_by) VALUES
  ('e1000001-0000-0000-0000-000000000002','f0000001-0000-0000-0000-000000000001','2','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000002','f0000001-0000-0000-0000-000000000002','MacBook Air M3','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000002','f0000001-0000-0000-0000-000000000003','SKU-0002','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000002','f0000001-0000-0000-0000-000000000004','Electronics','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000002','f0000001-0000-0000-0000-000000000005','1299.00','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000002','f0000001-0000-0000-0000-000000000006','75','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000002','f0000001-0000-0000-0000-000000000007','true','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000002','f0000001-0000-0000-0000-000000000008','2024-03-08','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000002','f0000001-0000-0000-0000-000000000009','System Admin','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000002','f0000001-0000-0000-0000-000000000010','Active','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000002','f0000001-0000-0000-0000-000000000011','https://apple.com/macbook-air','6a586195-661b-4cc1-bcff-92b0a215bd8d')
ON CONFLICT DO NOTHING;

-- Row 2: Python Crash Course
INSERT INTO cells (row_id,col_id,value,updated_by) VALUES
  ('e1000001-0000-0000-0000-000000000003','f0000001-0000-0000-0000-000000000001','3','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000003','f0000001-0000-0000-0000-000000000002','Python Crash Course','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000003','f0000001-0000-0000-0000-000000000003','SKU-0003','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000003','f0000001-0000-0000-0000-000000000004','Books','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000003','f0000001-0000-0000-0000-000000000005','35.99','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000003','f0000001-0000-0000-0000-000000000006','320','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000003','f0000001-0000-0000-0000-000000000007','true','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000003','f0000001-0000-0000-0000-000000000008','2023-05-15','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000003','f0000001-0000-0000-0000-000000000009','Project Manager','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000003','f0000001-0000-0000-0000-000000000010','Active','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000003','f0000001-0000-0000-0000-000000000011','https://nostarch.com/python-crash-course','6a586195-661b-4cc1-bcff-92b0a215bd8d')
ON CONFLICT DO NOTHING;

-- Row 3: VS Code Pro License
INSERT INTO cells (row_id,col_id,value,updated_by) VALUES
  ('e1000001-0000-0000-0000-000000000004','f0000001-0000-0000-0000-000000000001','4','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000004','f0000001-0000-0000-0000-000000000002','VS Code Pro License','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000004','f0000001-0000-0000-0000-000000000003','SKU-0004','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000004','f0000001-0000-0000-0000-000000000004','Software','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000004','f0000001-0000-0000-0000-000000000005','49.00','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000004','f0000001-0000-0000-0000-000000000006','500','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000004','f0000001-0000-0000-0000-000000000007','true','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000004','f0000001-0000-0000-0000-000000000008','2024-01-10','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000004','f0000001-0000-0000-0000-000000000009','System Admin','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000004','f0000001-0000-0000-0000-000000000010','Active','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000004','f0000001-0000-0000-0000-000000000011','https://code.visualstudio.com','6a586195-661b-4cc1-bcff-92b0a215bd8d')
ON CONFLICT DO NOTHING;

-- Row 4: Winter Jacket
INSERT INTO cells (row_id,col_id,value,updated_by) VALUES
  ('e1000001-0000-0000-0000-000000000005','f0000001-0000-0000-0000-000000000001','5','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000005','f0000001-0000-0000-0000-000000000002','Winter Jacket','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000005','f0000001-0000-0000-0000-000000000003','SKU-0005','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000005','f0000001-0000-0000-0000-000000000004','Clothing','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000005','f0000001-0000-0000-0000-000000000005','129.99','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000005','f0000001-0000-0000-0000-000000000006','48','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000005','f0000001-0000-0000-0000-000000000007','true','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000005','f0000001-0000-0000-0000-000000000008','2023-10-01','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000005','f0000001-0000-0000-0000-000000000009','Folder Manager','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000005','f0000001-0000-0000-0000-000000000010','Active','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000005','f0000001-0000-0000-0000-000000000011','https://example.com/winter-jacket','6a586195-661b-4cc1-bcff-92b0a215bd8d')
ON CONFLICT DO NOTHING;

-- Row 5: Protein Shake Mix
INSERT INTO cells (row_id,col_id,value,updated_by) VALUES
  ('e1000001-0000-0000-0000-000000000006','f0000001-0000-0000-0000-000000000001','6','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000006','f0000001-0000-0000-0000-000000000002','Protein Shake Mix','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000006','f0000001-0000-0000-0000-000000000003','SKU-0006','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000006','f0000001-0000-0000-0000-000000000004','Food','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000006','f0000001-0000-0000-0000-000000000005','29.99','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000006','f0000001-0000-0000-0000-000000000006','200','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000006','f0000001-0000-0000-0000-000000000007','true','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000006','f0000001-0000-0000-0000-000000000008','2024-02-14','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000006','f0000001-0000-0000-0000-000000000009','Project Member','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000006','f0000001-0000-0000-0000-000000000010','Active','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000006','f0000001-0000-0000-0000-000000000011','https://example.com/protein-shake','6a586195-661b-4cc1-bcff-92b0a215bd8d')
ON CONFLICT DO NOTHING;

-- Row 6: Wireless Earbuds (Out of Stock, Discontinued)
INSERT INTO cells (row_id,col_id,value,updated_by) VALUES
  ('e1000001-0000-0000-0000-000000000007','f0000001-0000-0000-0000-000000000001','7','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000007','f0000001-0000-0000-0000-000000000002','Wireless Earbuds','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000007','f0000001-0000-0000-0000-000000000003','SKU-0007','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000007','f0000001-0000-0000-0000-000000000004','Electronics','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000007','f0000001-0000-0000-0000-000000000005','79.99','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000007','f0000001-0000-0000-0000-000000000006','0','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000007','f0000001-0000-0000-0000-000000000007','false','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000007','f0000001-0000-0000-0000-000000000008','2023-11-20','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000007','f0000001-0000-0000-0000-000000000009','Demo User','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000007','f0000001-0000-0000-0000-000000000010','Discontinued','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000007','f0000001-0000-0000-0000-000000000011','https://example.com/earbuds','6a586195-661b-4cc1-bcff-92b0a215bd8d')
ON CONFLICT DO NOTHING;

-- Row 7: Docker in Practice
INSERT INTO cells (row_id,col_id,value,updated_by) VALUES
  ('e1000001-0000-0000-0000-000000000008','f0000001-0000-0000-0000-000000000001','8','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000008','f0000001-0000-0000-0000-000000000002','Docker in Practice','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000008','f0000001-0000-0000-0000-000000000003','SKU-0008','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000008','f0000001-0000-0000-0000-000000000004','Books','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000008','f0000001-0000-0000-0000-000000000005','42.00','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000008','f0000001-0000-0000-0000-000000000006','85','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000008','f0000001-0000-0000-0000-000000000007','true','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000008','f0000001-0000-0000-0000-000000000008','2023-07-30','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000008','f0000001-0000-0000-0000-000000000009','Project Manager','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000008','f0000001-0000-0000-0000-000000000010','Active','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000008','f0000001-0000-0000-0000-000000000011','https://manning.com/books/docker-in-practice','6a586195-661b-4cc1-bcff-92b0a215bd8d')
ON CONFLICT DO NOTHING;

-- Row 8: Cloud Storage 1TB (Draft)
INSERT INTO cells (row_id,col_id,value,updated_by) VALUES
  ('e1000001-0000-0000-0000-000000000009','f0000001-0000-0000-0000-000000000001','9','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000009','f0000001-0000-0000-0000-000000000002','Cloud Storage 1TB','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000009','f0000001-0000-0000-0000-000000000003','SKU-0009','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000009','f0000001-0000-0000-0000-000000000004','Software','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000009','f0000001-0000-0000-0000-000000000005','9.99','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000009','f0000001-0000-0000-0000-000000000006','1000','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000009','f0000001-0000-0000-0000-000000000007','true','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000009','f0000001-0000-0000-0000-000000000008','2024-03-01','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000009','f0000001-0000-0000-0000-000000000009','System Admin','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000009','f0000001-0000-0000-0000-000000000010','Draft','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000009','f0000001-0000-0000-0000-000000000011','https://example.com/cloud-storage','6a586195-661b-4cc1-bcff-92b0a215bd8d')
ON CONFLICT DO NOTHING;

-- Row 9: Running Shoes (Out of Stock, Discontinued)
INSERT INTO cells (row_id,col_id,value,updated_by) VALUES
  ('e1000001-0000-0000-0000-000000000010','f0000001-0000-0000-0000-000000000001','10','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000010','f0000001-0000-0000-0000-000000000002','Running Shoes','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000010','f0000001-0000-0000-0000-000000000003','SKU-0010','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000010','f0000001-0000-0000-0000-000000000004','Clothing','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000010','f0000001-0000-0000-0000-000000000005','95.00','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000010','f0000001-0000-0000-0000-000000000006','0','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000010','f0000001-0000-0000-0000-000000000007','false','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000010','f0000001-0000-0000-0000-000000000008','2022-04-15','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000010','f0000001-0000-0000-0000-000000000009','Folder Manager','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000010','f0000001-0000-0000-0000-000000000010','Discontinued','6a586195-661b-4cc1-bcff-92b0a215bd8d'),
  ('e1000001-0000-0000-0000-000000000010','f0000001-0000-0000-0000-000000000011','https://example.com/running-shoes','6a586195-661b-4cc1-bcff-92b0a215bd8d')
ON CONFLICT DO NOTHING;

-- ── 5. Discussion thread (Conversations demo) ────────────────────────────────
INSERT INTO discussions (id, workspace_id, sheet_id, title, author_id, body, resolved)
VALUES (
  'fd000001-0000-0000-0000-000000000001',
  '263fcc2a-9f41-4097-ad7d-4090c1896940',
  'ee000001-0000-0000-0000-000000000001',
  'iPhone 15 Pro pricing review',
  '6a586195-661b-4cc1-bcff-92b0a215bd8d',
  'Competitor analysis shows the iPhone 15 Pro at $999 may be slightly above the market average for Q4. Suggest reviewing Unit Price before the next sales cycle. @Project Manager can you confirm with the finance team?',
  false
) ON CONFLICT DO NOTHING;

INSERT INTO discussion_comments (id, discussion_id, author_id, body) VALUES
  ('fc000001-0000-0000-0000-000000000001',
   'fd000001-0000-0000-0000-000000000001',
   '7a8593c9-7f1b-4f8d-f694-383ed1ec06ac',
   'Confirmed with finance. Recommend reducing to $949 for the Q4 campaign. I will update the Unit Price cell once approved.')
ON CONFLICT DO NOTHING;

INSERT INTO discussion_comments (id, discussion_id, author_id, body) VALUES
  ('fc000001-0000-0000-0000-000000000002',
   'fd000001-0000-0000-0000-000000000001',
   'e7616147-3860-4966-9e67-d64e963b57da',
   'Approved. Please update and mark this thread as resolved once done.')
ON CONFLICT DO NOTHING;

-- ── 6. Worksheet-scope attachment (original Excel import demo) ───────────────
INSERT INTO attachments (id, workspace_id, scope, sheet_id, filename, s3_key, size_bytes, mime_type, uploaded_by)
VALUES (
  'fa000001-0000-0000-0000-000000000001',
  '263fcc2a-9f41-4097-ad7d-4090c1896940',
  'sheet',
  'ee000001-0000-0000-0000-000000000001',
  'product_catalog_v2.xlsx',
  'demo/263fcc2a/product_catalog_v2.xlsx',
  52480,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '6a586195-661b-4cc1-bcff-92b0a215bd8d'
) ON CONFLICT DO NOTHING;

-- Row-scope attachment on the iPhone row (invoice image)
INSERT INTO attachments (id, workspace_id, scope, sheet_id, row_id, filename, s3_key, size_bytes, mime_type, uploaded_by)
VALUES (
  'fa000001-0000-0000-0000-000000000002',
  '263fcc2a-9f41-4097-ad7d-4090c1896940',
  'row',
  'ee000001-0000-0000-0000-000000000001',
  'e1000001-0000-0000-0000-000000000001',
  'iphone15pro_spec_sheet.pdf',
  'demo/263fcc2a/iphone15pro_spec_sheet.pdf',
  187392,
  'application/pdf',
  '6a586195-661b-4cc1-bcff-92b0a215bd8d'
) ON CONFLICT DO NOTHING;

COMMIT;
