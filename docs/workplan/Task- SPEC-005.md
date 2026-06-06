# Task Checklist - SPEC-005: Collaboration & View Management Module

- [x] **Phase 4: Public Mirror Sharing (Read-only View)**
  - [x] Implement public sharing endpoints in `sheets.ts` (`POST`, `GET`, `DELETE`, `PUT` for `/sheets/:id/share/public` and the unauthenticated data endpoint `GET /sheets/shared/:token`).
  - [x] Create Next.js unauthenticated page `app/shared/[token]/page.tsx` displaying whitelisted columns only.
- [ ] **Phase 5: Dynamic Card & Calendar Views**
  - [ ] Update Kanban view in `SpecialViews.tsx` to group dynamically using active sheet columns and support drag/lane mutations in CRDT.
  - [ ] Update Calendar view in `SpecialViews.tsx` to group dynamically by user-selected date column using `gridStore` cells.
- [ ] **Phase 6: Conditional Formatting & Visual Proofing**
  - [ ] Implement rules evaluation logic inside `GridCanvas.tsx` canvas rendering.
  - [ ] Create `ProofCanvas.tsx` for placing pins and commenting on image attachments.
