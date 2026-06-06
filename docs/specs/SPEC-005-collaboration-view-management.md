# SPEC-005: Collaboration & View Management Module

**Status**: Draft  
**Date**: 2026-06-06  
**Author**: Engineering Team  
**Source survey**: `docs/study/Collaboration and View Management Module.txt`  
**Related**: [SPEC-003: File System Hierarchy](SPEC-003-file-system-hierarchy.md) · [SPEC-004: Project & Timeline Engine](SPEC-004-project-timeline-engine.md)

---

## 1. Overview

This specification defines the collaboration and view management layer of CTM. It covers sheet initialization modes, template import, row/column operations, the attachment and visual proofing systems, the conversation hub, conditional formatting, the four-view transformation engine (Grid / Card / Calendar / Gantt), and public shared-view publishing.

Each section documents the **selected technical approach** from the survey, with justification based on what is already in the CTM stack.

---

## 2. Sheet Creation Modes & Template Import

### 2.1 Sheet Modes

Every sheet has a `type` field (added in migration 015). Two modes are relevant to this spec:

| Mode | `type` value | Behaviour |
|------|-------------|-----------|
| **Grid Mode** | `SPREADSHEET` | Fully flexible columns; user defines all column types |
| **Project Mode** | `GRID` | System enforces four required columns on creation; feeds the PM/Gantt engine |

**Project Mode required columns** (created automatically, non-deletable):

| Column name | `ColumnType` | Notes |
|-------------|-------------|-------|
| Task Name | `text` | Maps to `pm.tasks.name` |
| Start Date | `date` | Maps to `pm.tasks.start_date` |
| Finish Date | `date` | Maps to `pm.tasks.end_date` |
| Predecessors | `text` | Parsed by `cpm.ParsePredecessorString` (SPEC-004 §2.3) |

**Decision:** Use the existing `type` column on `sheets`. The API's `POST /sheets` body gains a `mode` field (`grid` | `project`); if `project`, the handler inserts the four required columns as a single batch after sheet creation and creates a corresponding `pm.projects` record.

### 2.2 Template Importer Engine

**Selected approach: SheetJS (client-side parse) + server-side type-inference with user verification dialog.**

The import flow for `.xlsx` files re-uses the existing `POST /v1/import` endpoint (already implemented in `import.ts`). It is extended with a column-inference step before rows are written.

**Import pipeline:**

```
[User drops .xlsx / CSV / Google Sheets export]
        │
        ▼
[SheetJS parses file in-browser → raw column headers + sample rows]
        │
        ▼
[Type Inference Engine]
  - Runs regex + statistical sampling on first 20 rows per column
  - Scores each column against known types (date, number, contact, dropdown)
  - Confidence threshold: 85 % → auto-map; below 85 % → user verification dialog
        │
        ▼
[User Verification Dialog]
  - Shows each ambiguous column with suggested type + override dropdown
  - User confirms or corrects mappings
        │
        ▼
[POST /v1/import → server creates sheet + columns → imports rows]
```

**Type inference rules:**

| Pattern | Inferred type |
|---------|--------------|
| `YYYY-MM-DD`, `DD/MM/YYYY`, `MM-DD-YY` | `date` |
| All values are numeric | `number` |
| All values in a small fixed set (≤ 20 unique values) | `dropdown` |
| Values match workspace user emails | `contact` |
| Starts with `http://` or `https://` | `url` |
| Otherwise | `text` |

**`.mpp` (MS Project) import:** Out of scope for Phase 1. Defer to a dedicated Python parser in the `ai-service` (`POST /v1/import/mpp`). The file is proxied to the AI service which converts it to the CTM task JSON format.

---

## 3. Row & Column Operations

### 3.1 Bulk Row Creation

**Selected approach: Extend existing batch insert (already supports up to 500 rows in `POST /sheets/:sheetId/rows`).**

The existing `InsertRowsBody` schema already accepts an array of rows with optional positions and cell values. The UI exposes a context-menu command "Insert N rows below" that dispatches a single batch request.

**Constraint:** Bulk insert must not invalidate active WebSocket cursors. The collab service's CRDT (Yjs) handles concurrent position updates — the batch insert is expressed as a single Yjs transaction, keeping position pointers stable for all connected clients.

### 3.2 Column Type Validation

**Selected approach: Server-side cell write validation using the column's `validation` object (already in `ColumnValidation` type) + runtime type-specific validators.**

| Column type | Validation rule |
|-------------|----------------|
| `contact` | Cell value must be a UUID matching a `users.id` in the same workspace |
| `dropdown` | Cell value must be a member of `column.format.dropdownOptions[].label`; reject on save if not found |
| `date` / `datetime` | Cell value must parse to a valid ISO date; reject if not |
| `number` / `currency` | Cell value must be numeric; reject otherwise |

Validation runs in the `PUT /sheets/:sheetId/rows/:rowId/cells/:colId` handler before the cell is written to the database.

### 3.3 Column Reordering

**Selected approach: Optimistic drag-and-drop in the frontend; persist via `PUT /sheets/:sheetId/columns/:colId` updating the `position` field; broadcast new order via the collab CRDT.**

Flow:
1. User drags a column header. A floating ghost element tracks `X` position.
2. On `mouseup`, the new `position` index is computed from the drop target.
3. The frontend dispatches a `PUT /columns/:colId` with `{ position: newIndex }` for the moved column and increments/decrements `position` for all affected columns in a single batch request.
4. The collab service broadcasts the updated column order as a Yjs `Map` update so all sessions reflect the change without a page reload.

---

## 4. Attachment System

### 4.1 Dual-Scope Design

**Selected approach: Extend the existing `attachments` table with an explicit `scope` enum and a `sheet_id` FK for sheet-level scope.**

The existing `attachments` table (`001_core_schema.sql:119`) already has `row_id` (nullable) and `workspace_id`. Extend it:

```sql
-- migration 016: attachment scope extension
ALTER TABLE attachments
  ADD COLUMN scope TEXT NOT NULL DEFAULT 'row'
    CHECK (scope IN ('row', 'sheet', 'workspace')),
  ADD COLUMN sheet_id UUID REFERENCES sheets(id) ON DELETE CASCADE;

CREATE INDEX ON attachments(sheet_id) WHERE sheet_id IS NOT NULL;
CREATE INDEX ON attachments(workspace_id, scope);
```

| Scope | `row_id` | `sheet_id` | `workspace_id` | Visibility |
|-------|----------|-----------|----------------|-----------|
| `row` | set | optional | set | Members with row access |
| `sheet` | null | set | set | All sheet collaborators |
| `workspace` | null | null | set | All workspace members |

### 4.2 Upload Flow (MinIO Presigned URLs)

**Selected approach: Client-side direct upload to MinIO via presigned PUT URL, bypassing the API service for the binary payload.**

```
[Browser]                  [API Service]              [MinIO]
   │── POST /attachments/presign ──►│                    │
   │◄── { presignedUrl, s3Key } ────│                    │
   │── PUT {presignedUrl} (file) ───────────────────────►│
   │── POST /attachments/confirm ──►│                    │
   │   { s3Key, filename, size,  }  │── HEAD s3Key ─────►│
   │                                │◄── 200 OK ─────────│
   │◄── { attachment record } ──────│                    │
```

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/attachments/presign` | Generate presigned PUT URL (5-min TTL); record pending attachment |
| `POST` | `/v1/attachments/confirm` | Verify upload completed; activate attachment record |
| `GET` | `/v1/attachments?scope=row&rowId=:id` | List row attachments |
| `GET` | `/v1/attachments?scope=sheet&sheetId=:id` | List sheet attachments |
| `GET` | `/v1/attachments?scope=workspace` | List workspace attachments |
| `DELETE` | `/v1/attachments/:id` | Soft-delete; sets `deleted_at`; does NOT delete S3 object (async GC job) |
| `GET` | `/v1/attachments/:id/download` | Generate short-lived presigned GET URL (15-min TTL) |

---

## 5. Visual Proofing Engine

### 5.1 Design

**Selected approach: Extend the existing `discussions` table with proof-pin coordinate columns. Render pins as an SVG overlay on the image canvas in the frontend.**

A proof review is an image attachment that has one or more annotated pin discussions linked to pixel-percentage coordinates.

### 5.2 Database Schema

```sql
-- migration 016 (continued)
ALTER TABLE discussions
  ADD COLUMN proof_attachment_id UUID REFERENCES attachments(id) ON DELETE CASCADE,
  ADD COLUMN pin_x_pct  NUMERIC(5,4),  -- 0.0000 to 1.0000
  ADD COLUMN pin_y_pct  NUMERIC(5,4);  -- 0.0000 to 1.0000

-- Discussions with proof_attachment_id are "proof pins"
CREATE INDEX ON discussions(proof_attachment_id) WHERE proof_attachment_id IS NOT NULL;
```

A standard discussion has `proof_attachment_id = NULL`. A proof pin has it set.

### 5.3 Pin Coordinate Calculation

Coordinates are stored as **percentages of the canvas dimensions**, making them resolution-independent:

$$X_{\%} = \frac{X_{\text{click}}}{W_{\text{canvas}}}, \quad Y_{\%} = \frac{Y_{\text{click}}}{H_{\text{canvas}}}$$

When rendering, the pin is positioned at:

$$X_{\text{px}} = X_{\%} \times W_{\text{rendered}}, \quad Y_{\text{px}} = Y_{\%} \times H_{\text{rendered}}$$

### 5.4 UI Interaction Flow

1. User opens the **Proof panel** by clicking a `scope=sheet` attachment thumbnail.
2. The attachment image is rendered inside a `<div>` with `position: relative`. An `<svg>` overlay fills the same bounding box.
3. Clicking anywhere on the image fires a `click` event. The handler computes `(X_pct, Y_pct)` and opens an inline comment input anchored to the click point.
4. On submit, `POST /v1/discussions` is called with `{ proof_attachment_id, pin_x_pct, pin_y_pct, body }`.
5. Each existing pin is rendered as a numbered `<circle>` element in the SVG overlay. Hovering or clicking a pin expands its comment thread in the sidebar.
6. Pins auto-number sequentially by `created_at` within the attachment scope.

---

## 6. Conversation Hub

### 6.1 Comment Scoping

**Selected approach: Use the existing `Comment` type from `messaging.ts` with `targetType: 'row' | 'sheet'`. Route through the `messaging-service`.**

The `messaging.ts` `Comment` interface already supports `targetType: 'cell' | 'row' | 'column' | 'sheet'` with `targetRef` as the foreign-key value. No schema changes needed for basic commenting.

| Scope | `targetType` | `targetRef` |
|-------|-------------|-------------|
| Row | `'row'` | `row.id` |
| Sheet (global) | `'sheet'` | `sheet.id` |
| Proof pin | `'row'` | `row.id` + `proof_attachment_id` on discussions table |

### 6.2 Email Forwarding

**Selected approach: Extend the notification system in `messaging-service` with an outbound SMTP relay triggered by an explicit "Forward to email" user action.**

Flow:
1. User clicks "Forward thread" on a comment thread.
2. Frontend calls `POST /v1/messaging/comments/:threadId/forward` with `{ recipientEmails: string[] }`.
3. `messaging-service` fetches the thread, assembles an HTML email with:
   - Thread context (sheet name, row data summary)
   - Full comment chain
   - A deep-link back to the specific row: `https://{host}/{workspaceId}/sheets/{sheetId}?row={rowId}`
4. Sends via SMTP (configured via `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` env vars).
5. Logs the forward event in a `notification_forwards` audit table.

**Email is opt-in per action only** (no background watcher). Push notifications for comment mentions (`@user`) are handled by the existing notification system.

---

## 7. Conditional Formatting Engine

### 7.1 Selected Approach: Client-Side Evaluation

**Decision: Client-side rule evaluation in the `GridCanvas` component, triggered reactively on cell value changes. No server round-trip for display.**

Justification:
- Rules reference only values already in local state (`gridStore`).
- Server-side evaluation would add latency to every cell render cycle.
- The `SheetSettings.conditionalFormatRules` array is already defined in `sheet.ts` and loaded with the sheet.

### 7.2 Rule Schema

Rules are stored in `sheets.settings.conditionalFormatRules` (already defined in `SheetSettings`):

```typescript
interface ConditionalFormatRule {
  id: string
  colId: string                          // column to evaluate
  condition: ConditionOperator
  value: string                          // comparison value
  style: Partial<CellFormat>             // styles to apply
  applyToRow?: boolean                   // if true, styles the whole row
}

type ConditionOperator =
  | 'equals' | 'not_equals'
  | 'contains' | 'not_contains'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'is_empty' | 'is_not_empty'
  | 'is_checked' | 'is_not_checked'
```

### 7.3 Evaluation Loop

```
[Cell value changes in gridStore]
         │
         ▼
[For each active ConditionalFormatRule in sheet.settings.conditionalFormatRules:]
    1. Read cell value for rule.colId in the affected row
    2. Evaluate: rule.condition(cellValue, rule.value)
    3. If true → merge rule.style into the row/cell render style map
    4. If false → remove rule contribution from the style map
         │
         ▼
[GridCanvas reads final merged style map → repaints affected cells/rows]
```

Rules are evaluated in **array order**; later rules override earlier ones for the same style property (last-writer-wins per property).

### 7.4 Example

```
Rule: IF [Status] equals "Complete" THEN row style = { strikethrough: true, color: "#9ca3af" }
Rule: IF [At Risk] is_checked THEN row style = { bgColor: "#fef2f2", fontColor: "#ef4444" }
```

### 7.5 Rule Management API

| Method | Path | Description |
|--------|------|-------------|
| `PUT` | `/v1/sheets/:id` | Update sheet settings including `conditionalFormatRules` array |

Rules are part of the sheet settings blob — no separate endpoint needed. The full `settings` object is PUT on save.

---

## 8. Multi-View Transformation Engine

### 8.1 Architecture

**Selected approach: Single Zustand `gridStore` as the source of truth. Each view is a pure reactive projection. View type is stored in `uiStore`. Mutations in any view call the same API and update the shared store.**

```
┌────────────────────────────────────────────────┐
│              gridStore (Zustand)               │
│  rows[], columns[], cells{}, conditionalRules  │
└──────────────┬─────────────────────────────────┘
               │  reactive subscriptions
    ┌──────────┼──────────┬──────────────┐
    ▼          ▼          ▼              ▼
┌────────┐ ┌────────┐ ┌──────────┐ ┌─────────┐
│  Grid  │ │  Card  │ │ Calendar │ │  Gantt  │
│  View  │ │  View  │ │  View    │ │  View   │
└────────┘ └────────┘ └──────────┘ └─────────┘
    │          │           │              │
    └──────────┴───────────┴──────────────┘
              all mutations → same API
```

The active view type is toggled from the **ViewPicker** toolbar (`ViewPicker.tsx` already exists).

### 8.2 Grid View

The primary data entry plane. Renders all rows in a 2D spreadsheet using the `GridCanvas` canvas renderer. No transformation required — this is the raw state.

**Status:** Largely implemented. `GridCanvas.tsx` exists.

### 8.3 Card View (Kanban)

**Transformation:** Groups rows into swim-lane columns based on a user-selected **group-by column** (any `dropdown` or `contact` type column).

```
[gridStore rows]
       │
       ▼
groupBy(rows, groupColId)
→ {
    "Not Started": [row3, row7, ...],
    "In Progress": [row1, row5, ...],
    "Complete":    [row2, row4, ...]
  }
```

**Drag-and-drop lane change:**
1. User drags a card from lane "Not Started" to lane "In Progress".
2. `onDrop` handler: calls `PUT /sheets/:sheetId/rows/:rowId/cells/:colId` with `{ value: "In Progress" }`.
3. `gridStore` updates the cell value → all views re-render.

**Card fields:** Each card renders the row's primary text column + configurable secondary fields (status, assignee, due date). The user selects which columns appear on cards via a Card Settings panel.

### 8.4 Calendar View

**Transformation:** Projects rows with valid date cells onto a monthly or weekly calendar grid.

**Date column detection:** The view scans the sheet's columns for any `date` type column. The user selects which date column to map (e.g., "Due Date", "Start Date").

```
[gridStore rows filtered to rows with a non-null value in the selected date column]
       │
       ▼
group by calendar day (YYYY-MM-DD)
       │
       ▼
[render in monthly/weekly grid; each day cell shows a list of row title chips]
```

**Chip click:** Opens the row detail panel. Any edit in the panel writes through `gridStore` and updates the calendar position instantly.

**Month/week toggle:** Stored in `uiStore.calendarResolution: 'month' | 'week'`.

### 8.5 Gantt View

Covered in full in **SPEC-004**. In the context of this spec, the Gantt view is triggered via the same ViewPicker toggle as Card and Calendar views. It reads from `gridStore` for task metadata and from the PM service (`GET /projects/:pid/tasks`) for scheduling.

### 8.6 View Persistence

The active view type per sheet is persisted per-user in `user_sheet_interactions.settings` (a JSONB column added to track view state):

```sql
-- migration 016 (continued)
ALTER TABLE user_sheet_interactions
  ADD COLUMN settings JSONB NOT NULL DEFAULT '{}';
-- stores: { lastView: 'grid' | 'card' | 'calendar' | 'gantt', groupByColId: uuid|null, ... }
```

---

## 9. Published Mirror Sharing (Public Link)

### 9.1 Selected Approach

**Use the existing `sharing` table** (`principal_type = 'public'`) as the authoritative record. Generate a 32-byte hex token stored in a new `public_token` column on the `sharing` row. Serve the shared view from a dedicated Next.js route that fetches data via a token-only auth path.

### 9.2 Database Schema

```sql
-- migration 016 (continued)
ALTER TABLE sharing
  ADD COLUMN public_token TEXT UNIQUE,   -- 64-char hex, only set when principal_type='public'
  ADD COLUMN visible_col_ids UUID[],     -- NULL = all columns; set = column whitelist
  ADD COLUMN expires_at TIMESTAMPTZ;     -- NULL = never expires

CREATE INDEX ON sharing(public_token) WHERE public_token IS NOT NULL;
```

### 9.3 Token Generation

```
POST /v1/sheets/:sheetId/share/public
Body: { visibleColIds?: string[], expiresAt?: string }

→ INSERT INTO sharing (resource_type='sheet', resource_id=sheetId,
                        principal_type='public', principal_id=NULL,
                        role='VIEWER',
                        public_token=hex(randomBytes(32)),
                        visible_col_ids=..., expires_at=...)
→ returns { token, url: "https://{host}/shared/{token}" }
```

### 9.4 Shared View Server Route

The Next.js route `app/shared/[token]/page.tsx` handles unauthenticated access:

```
GET /shared/{token}
       │
       ▼
[Server: SELECT * FROM sharing WHERE public_token=$1 AND (expires_at IS NULL OR expires_at > NOW())]
       │ not found → 404
       │ found →
       ▼
[Fetch sheet + rows + columns from API using internal service token]
[Apply column whitelist if visible_col_ids is set]
[Strip: edit endpoints, attachment metadata, comment threads, user PII]
       │
       ▼
[Render read-only GridCanvas with data; no auth headers; no mutation controls]
```

**Security properties:**
- Token is 256-bit random — not guessable.
- `expires_at` enforces time-limited access.
- No edit, comment, or attachment endpoints are available without a valid JWT.
- Column masking prevents exposure of hidden columns (e.g., internal notes, contact emails).

### 9.5 Token Management API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/sheets/:id/share/public` | Create public link; returns token + URL |
| `GET` | `/v1/sheets/:id/share/public` | Get current public link settings |
| `DELETE` | `/v1/sheets/:id/share/public` | Revoke token (deletes sharing row) |
| `PUT` | `/v1/sheets/:id/share/public` | Update column whitelist or expiry |

---

## 10. Implementation Audit

### 10.1 What is Already Implemented

| Feature | Status | Location |
|---------|--------|----------|
| Sheet `type` field | ✅ Added (migration 015) | `schema.ts`, `sheets.ts` |
| `.xlsx` / `.csv` import pipeline | ✅ Implemented | `routes/import.ts`, `importJobs` table |
| Batch row insertion (up to 500) | ✅ Implemented | `routes/rows.ts` `POST /:sheetId/rows` |
| Column types incl. `contact`, `dropdown` | ✅ Implemented | `shared-types/column.ts`, `columns` table |
| Column `position` field (reordering) | ✅ Schema exists | `columns` table |
| Attachment table with `row_id` FK | ✅ Implemented | `attachments` table (migration 001) |
| `sharing` table with `principal_type='public'` | ✅ Schema exists | migration 001 |
| Discussions table (row/sheet-scope) | ✅ Implemented | `discussions`, `discussion_comments` tables |
| `conditionalFormatRules` in `SheetSettings` | ✅ Type defined | `shared-types/sheet.ts` |
| `ViewPicker` component | ✅ Exists | `components/grid/ViewPicker.tsx` |
| `gridStore` Zustand store | ✅ Exists | `store/gridStore.ts` |
| Comment type with `targetType` | ✅ Defined | `shared-types/messaging.ts` |
| MinIO for object storage | ✅ Running | `docker-compose.yml`, `exportJobs` (already uses S3 keys) |
| `user_sheet_interactions` table | ✅ Exists | migration 001 |

### 10.2 Gap Summary

| # | Gap | Severity | Phase |
|---|-----|----------|-------|
| G-1 | Sheet creation does not enforce Project Mode required columns | High | 1 |
| G-2 | Column type-inference engine for import not implemented | High | 1 |
| G-3 | Cell write validation for `contact` and `dropdown` types not enforced server-side | High | 1 |
| G-4 | `attachments` table has no `scope` column — workspace/sheet scope not distinguishable | High | 1 |
| G-5 | No presigned upload URL endpoint; files route through API service (not scalable) | High | 1 |
| G-6 | `discussions` table has no `proof_attachment_id`, `pin_x_pct`, `pin_y_pct` columns | Medium | 2 |
| G-7 | No proof canvas UI or pin SVG overlay in the frontend | Medium | 2 |
| G-8 | `sharing` table has no `public_token`, `visible_col_ids`, `expires_at` columns | High | 1 |
| G-9 | No `GET /shared/:token` Next.js route for unauthenticated public view | High | 1 |
| G-10 | Conditional formatting rules exist in the type but are not evaluated in `GridCanvas` | Medium | 2 |
| G-11 | Card (Kanban) view not implemented | Medium | 2 |
| G-12 | Calendar view not implemented | Medium | 2 |
| G-13 | Column reorder does not broadcast via collab CRDT | Low | 3 |
| G-14 | Email forwarding from comment thread not implemented | Low | 3 |
| G-15 | `user_sheet_interactions` has no `settings` JSONB column for persisting active view | Low | 3 |
| G-16 | `.mpp` import not supported | Low | Deferred |

---

## 11. Migration Plan (Migration 016)

```sql
-- infra/postgres/migrations/016_collab_view_management.sql

BEGIN;

-- G-4: Attachment scope
ALTER TABLE attachments
  ADD COLUMN scope    TEXT NOT NULL DEFAULT 'row'
                        CHECK (scope IN ('row', 'sheet', 'workspace')),
  ADD COLUMN sheet_id UUID REFERENCES sheets(id) ON DELETE CASCADE;

CREATE INDEX ON attachments(sheet_id) WHERE sheet_id IS NOT NULL;
CREATE INDEX ON attachments(workspace_id, scope);

-- G-6: Proof pin coordinates on discussions
ALTER TABLE discussions
  ADD COLUMN proof_attachment_id UUID REFERENCES attachments(id) ON DELETE CASCADE,
  ADD COLUMN pin_x_pct  NUMERIC(5,4),
  ADD COLUMN pin_y_pct  NUMERIC(5,4);

CREATE INDEX ON discussions(proof_attachment_id) WHERE proof_attachment_id IS NOT NULL;

-- G-8: Public sharing token and column whitelist
ALTER TABLE sharing
  ADD COLUMN public_token   TEXT UNIQUE,
  ADD COLUMN visible_col_ids UUID[],
  ADD COLUMN share_expires_at TIMESTAMPTZ;

CREATE INDEX ON sharing(public_token) WHERE public_token IS NOT NULL;

-- G-15: Per-user view state on sheets
ALTER TABLE user_sheet_interactions
  ADD COLUMN settings JSONB NOT NULL DEFAULT '{}';

COMMIT;
```

---

## 12. Implementation Roadmap

### Phase 1 — Core Data & Sharing
1. **G-1**: Add `mode` param to `POST /sheets`; inject Project Mode columns on creation.
2. **G-3**: Add cell write validators for `contact` and `dropdown` types in `routes/cells.ts`.
3. **G-4 / G-5**: Run migration 016 attachment changes; build `POST /attachments/presign` + `POST /attachments/confirm` endpoints; wire MinIO presigned URL generation.
4. **G-8 / G-9**: Run migration 016 sharing changes; implement `POST /sheets/:id/share/public`; build Next.js `app/shared/[token]/page.tsx` read-only route.

### Phase 2 — Collaboration UI
5. **G-6 / G-7**: Run migration 016 proof fields; build proof canvas component with SVG pin overlay; extend discussion creation to accept `proof_attachment_id`, `pin_x_pct`, `pin_y_pct`.
6. **G-10**: Implement conditional formatting evaluation loop in `GridCanvas`; wire to `gridStore` cell change events.
7. **G-11**: Build Card (Kanban) view component; implement `groupBy` projection and drag-to-lane cell mutation.
8. **G-12**: Build Calendar view component; implement date-column projection onto monthly/weekly grid.

### Phase 3 — Polish & Advanced Features
9. **G-2**: Build column type-inference engine for import; add verification dialog to the import wizard UI.
10. **G-13**: Broadcast column reorder events through the collab CRDT (Yjs document shared map for column order).
11. **G-14**: Implement email forwarding endpoint in `messaging-service`; wire SMTP relay.
12. **G-15**: Persist active view and groupBy state in `user_sheet_interactions.settings`.

---

## 13. Open Questions

| # | Question | Owner |
|---|----------|-------|
| OQ-1 | Should the public shared view support a password pin as a second authentication factor? | Product |
| OQ-2 | Should Card View support multiple group-by dimensions (swimlanes + columns)? | Product |
| OQ-3 | Should comment reactions (emoji) be supported in the proof pin comment threads? | Product |
| OQ-4 | Is there a maximum number of proof pins per attachment? | Engineering |
| OQ-5 | Should the column whitelist for public views be configurable per-column or per-row (row-level data masking)? | Product |

---

## 14. Related Documents

- [SPEC-003: File System Hierarchy](SPEC-003-file-system-hierarchy.md)
- [SPEC-004: Project & Timeline Engine](SPEC-004-project-timeline-engine.md)
- [Core Schema Migration](../../infra/postgres/migrations/001_core_schema.sql)
- [Messaging Types](../../packages/shared-types/src/messaging.ts)
- [Sheet Settings Types](../../packages/shared-types/src/sheet.ts)
