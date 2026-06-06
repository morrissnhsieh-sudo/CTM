# Implementation Plan - SPEC-005: Collaboration & View Management Module (Continued)

Implement and complete the remaining collaboration and view management features of CTM, focusing on Public Mirror Sharing, Card & Calendar Views, Conditional Formatting, and the Visual Proofing Engine.

## User Review Required

> [!IMPORTANT]
> - **Public Sharing Auth-Bypass**: Unauthenticated public routes at `/shared/[token]` will fetch sheet, column, and cell data via a dedicated public API endpoint: `GET /v1/sheets/public/:token`. This endpoint will load the sharing rule, verify expiry, filter columns using the whitelist (`visibleColIds`), and strip out comments, history, and edit actions.
> - **Interactive View Mutations**: The Card (Kanban) and Calendar views will move away from mockup static arrays and bind reactively to the Zustand `gridStore` and the live collaborative CRDT document (`ydoc`), maintaining real-time multi-view synchronization.

## Proposed Changes

### 1. Backend API (`api-service`)

#### [MODIFY] [sheets.ts](file:///c:/Users/User/Code/CTM/apps/api-service/src/routes/sheets.ts)
- Implement endpoints for public sharing management:
  - `POST /:id/share/public`: Generates a secure random 32-byte hex token, inserts a row into `sharing` with `principalType = 'public'`, optional `visibleColIds` (columns whitelist), and `expiresAt`. Returns the token and access URL.
  - `GET /:id/share/public`: Retrieves the current active public sharing configurations for the sheet.
  - `DELETE /:id/share/public`: Revokes public sharing by deleting/nullifying the public sharing records.
  - `PUT /:id/share/public`: Updates column whitelist (`visibleColIds`) or expiry (`expiresAt`).
- Implement the unauthenticated public data access endpoint:
  - `GET /public/:token`: Resolves the token from the `sharing` table, checks expiry, fetches the underlying sheet, columns, rows, and cells, applies column whitelisting (excluding cells belonging to non-whitelisted columns), and strips all editing capability, attachments, and comments.

---

### 2. Frontend App & Routes (`frontend`)

#### [NEW] [shared/[token]/page.tsx](file:///c:/Users/User/Code/CTM/apps/frontend/src/app/shared/[token]/page.tsx)
- Create a Next.js unauthenticated page for viewing shared sheets.
- Fetch the public sheet structure and cell contents from `GET /v1/sheets/public/:token`.
- Render a read-only variant of `GridCanvas` or a custom read-only table without collaborative presence, sidebars, editing widgets, or database mutations.

---

### 3. Dynamic Card (Kanban) & Calendar Views

#### [MODIFY] [SpecialViews.tsx](file:///c:/Users/User/Code/CTM/apps/frontend/src/components/grid/SpecialViews.tsx)
- Update `renderKanban()`:
  - Allow the user to pick a group-by column (defaulting to the first `dropdown` or `contact` column).
  - Dynamically group the sheet rows based on the cell values of the group-by column.
  - Dynamically render lanes corresponding to dropdown choices or assignees.
  - On drag-and-drop or card move, update the cell value in the live collaborative document (`ydoc` Map) and `gridStore` to propagate changes across all views.
- Update `renderCalendar()`:
  - Allow the user to select the date column to display.
  - Group rows dynamically by day using date cell values from `gridStore`.
  - Display cards/chips chronologically inside calendar days. Click triggers the task details panel.

---

### 4. Conditional Formatting & Proofing

#### [MODIFY] [GridCanvas.tsx](file:///c:/Users/User/Code/CTM/apps/frontend/src/components/grid/GridCanvas.tsx)
- Implement client-side rule evaluation:
  - Read `conditionalFormatRules` from `sheets.settings`.
  - For each cell during rendering, run the rules engine (e.g., if value matches criterion, override cell background color, font styles, text decoration).
  - Apply styles on the HTML5 Canvas context during paint routines.

#### [NEW] [ProofCanvas.tsx](file:///c:/Users/User/Code/CTM/apps/frontend/src/components/grid/ProofCanvas.tsx)
- Create an image-annotation canvas component:
  - Displays the image with an SVG layout overlay.
  - Clicking on the image calculates the pixel-percentage coordinates `(pinXPct, pinYPct)` relative to container width/height.
  - Opens a comment/discussion form anchored to the clicked coordinate.
  - Creates a discussion via `POST /v1/discussions` with coordinates and `proofAttachmentId`.
  - Displays existing pins as SVG interactive circles, showing related discussion threads in a side overlay.

## Verification Plan

### Automated Tests
- Run database migrations and validation tests:
  ```powershell
  pnpm test
  ```

### Manual Verification
1. Create a public share link, restrict visible columns, and access the sheet in an Incognito tab. Confirm restricted columns are invisible and that no edits can be performed.
2. In Kanban View, select a different group-by column, drag a card to a new lane, switch to Grid View, and verify the corresponding cell value has changed.
3. Add a conditional formatting rule: `IF Status equals "Done" THEN strikethrough`. Verify cells/rows are immediately styled in Grid View.
4. Upload an image attachment, open the Proof panel, click to add annotations, and verify pin circles render precisely and scale with window size.
