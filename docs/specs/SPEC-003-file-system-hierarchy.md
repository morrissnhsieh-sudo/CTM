# SPEC-003: File System Hierarchy

**Status**: Draft  
**Date**: 2026-06-05  
**Author**: Engineering Team

---

## 1. Overview

This spec defines the canonical file system hierarchy for CTM. It describes the entities, their relationships, supported file types, permission inheritance, and the API contract. It also audits the current implementation against these requirements.

---

## 2. Hierarchy Model

The CTM file system follows a strict four-level hierarchy:

```
Workspace
  |- Project
  |    |- File                      (directly under project, no folder)
  |    |- Folder
  |         |- File                 (spreadsheet, grid, template, …)
  |         |- File
  |    |- Folder
  |         |- File
  |         |- File
  |- Project
       |- File
       |- Folder
            |- File
```

### 2.1 Level Summary

| Level | Entity | Parent | Can contain |
|-------|--------|--------|-------------|
| 1 | **Workspace** | — | Projects |
| 2 | **Project** | Workspace | Folders, Files |
| 3 | **Folder** | Project | Files |
| 4 | **File** | Project or Folder | — (leaf node) |

### 2.2 Rules

1. A **Workspace** is the root container. All content belongs to exactly one workspace.
2. A **Project** belongs to exactly one workspace. It cannot be moved between workspaces.
3. A **Folder** belongs to exactly one project. It cannot exist at the workspace level outside a project.
4. A **File** belongs to exactly one project. It may optionally be placed inside one Folder within that project.
5. Files placed directly under a project (no folder) are treated as top-level project files.
6. **Folder nesting is not supported** in the canonical hierarchy. Folders are a single level deep (Project → Folder → File).
7. Every file must have an explicit type (see §4).

---

## 3. Entity Definitions

### 3.1 Workspace

The top-level multi-tenant boundary. Users are invited to a workspace and all resources are scoped to it.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | string | Display name |
| `plan` | enum | `FREE`, `PRO`, `ENTERPRISE` |
| `ownerId` | UUID | User who created/owns the workspace |
| `settings` | JSONB | Feature flags, branding, etc. |
| `createdAt` | timestamp | Creation time |
| `deletedAt` | timestamp | Soft-delete timestamp (nullable) |

### 3.2 Project

An organizational unit within a workspace. Maps to a team, initiative, or deliverable.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `workspaceId` | UUID | FK → workspaces.id |
| `name` | string | Display name |
| `status` | enum | `ACTIVE`, `ARCHIVED`, `COMPLETED` |
| `startDate` | date | Optional project start |
| `endDate` | date | Optional project deadline |
| `settings` | JSONB | Project-level config |
| `createdBy` | UUID | FK → users.id |
| `createdAt` | timestamp | Creation time |
| `updatedAt` | timestamp | Last modified |

### 3.3 Folder

A named grouping of files within a project. Folders are one level deep.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `workspaceId` | UUID | FK → workspaces.id |
| `projectId` | UUID | FK → projects.id (**required**) |
| `name` | string | Display name |
| `createdBy` | UUID | FK → users.id |
| `createdAt` | timestamp | Creation time |

> **Note**: `parentId` (self-referential FK for sub-folders) is present in the current schema but is **not part of the canonical hierarchy**. Sub-folder nesting is out of scope for this spec (see §7.1).

### 3.4 File

A leaf node document. A file must belong to a project and may optionally be inside a folder.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `workspaceId` | UUID | FK → workspaces.id |
| `projectId` | UUID | FK → projects.id (**required**) |
| `folderId` | UUID | FK → folders.id (nullable — null = top-level in project) |
| `title` | string | Display name |
| `type` | enum | See §4 |
| `description` | string | Optional description |
| `createdBy` | UUID | FK → users.id |
| `settings` | JSONB | File-level config |
| `createdAt` | timestamp | Creation time |
| `updatedAt` | timestamp | Last modified |
| `archivedAt` | timestamp | Soft-archive timestamp (nullable) |

---

## 4. File Types

Files are typed to determine the editor, icon, and available features.

| Type | Description |
|------|-------------|
| `SPREADSHEET` | Standard spreadsheet with rows, columns, cells, and formula engine |
| `GRID` | Structured data grid (schema-first, no free-form formulas) |
| `TEMPLATE` | Read-only master file; can be instantiated into a new Spreadsheet or Grid |
| `FORM` | Data-entry form backed by a spreadsheet |
| `DASHBOARD` | Aggregated view composed of charts and metrics |

New types may be added via a follow-up spec; the `type` column uses an open enum to accommodate future extensions.

---

## 5. Roles and File System Access Privileges

### 5.1 Role Hierarchy

Roles are ordered by privilege level (highest to lowest):

```
Admin  >  PjM  >  Manager  >  Member
```

| Role | Full Name | Assigned By | Scope |
|------|-----------|-------------|-------|
| `ADMIN` | Workspace Administrator | System / workspace owner | Workspace |
| `PJM` | Project Manager | Admin | Workspace |
| `MANAGER` | Folder Manager | PjM (of owning project) | Project |
| `MEMBER` | Member | Manager (of owning folder) | Folder |

> **Ownership principle**: Except for Admin, all roles are scoped to resources the user *created*. A PjM cannot act on another PjM's projects; a Manager cannot act on another Manager's folders. Access is granted only over self-created resources and their children.

---

### 5.2 Workspace Privileges (Admin)

| Action | Admin | PjM | Manager | Member |
|--------|-------|-----|---------|--------|
| Create workspace | ✅ | ❌ | ❌ | ❌ |
| Delete workspace | ✅ | ❌ | ❌ | ❌ |
| Access **all** workspaces | ✅ | ❌ | ❌ | ❌ |
| Assign PjM to workspace | ✅ | ❌ | ❌ | ❌ |

**Rules:**
1. Only **Admin** can create and delete Workspaces.
2. Admin has full read/write access to **all** Workspaces, regardless of who created them.
3. Admin designates one or more users as **PjM** for a given Workspace.

---

### 5.3 Project Privileges (PjM)

| Action | Admin | PjM (owner) | PjM (other) | Manager | Member |
|--------|-------|-------------|-------------|---------|--------|
| Create project in workspace | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete own project | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete others' project | ✅ | ❌ | ❌ | ❌ | ❌ |
| Access own project & its contents | ✅ | ✅ | ❌ | ❌ | ❌ |
| Access others' project | ✅ | ❌ | ❌ | ❌ | ❌ |
| Assign Manager to own project | ✅ | ✅ | ❌ | ❌ | ❌ |
| Assign Member to own project | ✅ | ✅ | ❌ | ❌ | ❌ |

**Rules:**
1. **PjM** can create and delete Projects, but only Projects they personally created.
2. A PjM has **no access** to Projects created by other PjMs (unless also Admin).
3. A PjM can access all **Folders and Files** within their own Projects.
4. A PjM assigns **Manager** and **Member** roles only within Projects they created.

---

### 5.4 Folder Privileges (Manager)

| Action | Admin | PjM (project owner) | Manager (owner) | Manager (other) | Member |
|--------|-------|---------------------|-----------------|-----------------|--------|
| Create folder in project | ✅ | ✅ | ✅ | ✅* | ❌ |
| Delete own folder | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete others' folder | ✅ | ✅ | ❌ | ❌ | ❌ |
| Access own folder & its files | ✅ | ✅ | ✅ | ❌ | ❌ |
| Access others' folder | ✅ | ✅ | ❌ | ❌ | ❌ |
| Assign Member to own folder | ✅ | ✅ | ✅ | ❌ | ❌ |

> \* A Manager assigned to a project may create folders within that project, but can only manage (delete, assign) folders they personally created.

**Rules:**
1. **Manager** can create and delete Folders, but only Folders they personally created.
2. A Manager has **no access** to Folders created by other Managers within the same Project.
3. A Manager can access all **Files** inside their own Folders.
4. A Manager assigns **Member** roles only within Folders they created.

---

### 5.5 File Privileges (Member)

| Action | Admin | PjM (project owner) | Manager (folder owner) | Member |
|--------|-------|---------------------|------------------------|--------|
| Create file in accessible folder/project | ✅ | ✅ | ✅ | ✅ |
| Read file | ✅ | ✅ | ✅ | ✅ |
| Edit file content | ✅ | ✅ | ✅ | ✅ |
| Rename / move file | ✅ | ✅ | ✅ | ❌ |
| Delete / archive file | ✅ | ✅ | ✅ | ❌ |

**Rules:**
1. Any authenticated user with access to a Folder (or top-level Project) can **create Files** within it.
2. Members can read and edit file content, but cannot rename, move, or delete files.
3. Only the folder's Manager (or the project's PjM / Admin) can rename, move, or delete a file.

---

### 5.6 Role Assignment Summary

```
Admin
  └─ assigns PjM to Workspace
        └─ PjM (of own project)
              └─ assigns Manager to Project
                    └─ Manager (of own folder)
                          └─ assigns Member to Folder
```

| Who assigns | Role granted | Scope |
|-------------|--------------|-------|
| Admin | `PJM` | Workspace |
| PjM | `MANAGER` | Own project |
| PjM | `MEMBER` | Own project |
| Manager | `MEMBER` | Own folder |

---

### 5.7 Access Resolution Order

When checking whether a user may perform an action on a resource, evaluate in this order:

**For a File:**
1. Is the user `ADMIN`? → **Grant** (full access to all workspaces).
2. Is the user the `PJM` who **created** the file's parent project? → **Grant**.
3. Is the user the `MANAGER` who **created** the file's parent folder? → **Grant**.
4. Is the user a `MEMBER` of the file's parent folder? → **Grant** (read + edit content only).
5. → **Deny**.

**For a Folder:**
1. Is the user `ADMIN`? → **Grant**.
2. Is the user the `PJM` who **created** the folder's parent project? → **Grant**.
3. Is the user the `MANAGER` who **created** the folder? → **Grant**.
4. → **Deny**.

**For a Project:**
1. Is the user `ADMIN`? → **Grant**.
2. Is the user the `PJM` who **created** the project? → **Grant**.
3. → **Deny**.

**For a Workspace:**
1. Is the user `ADMIN`? → **Grant** (all workspaces).
2. → **Deny** (PjMs, Managers, and Members have no direct workspace management rights).

---

## 6. API Contract

All endpoints are under `/v1` and require a valid JWT in `Authorization: Bearer <token>`.

### 6.1 Projects

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/workspaces/:wid/projects` | List projects in workspace |
| `POST` | `/workspaces/:wid/projects` | Create project |
| `GET` | `/workspaces/:wid/projects/:pid` | Get project detail |
| `PUT` | `/workspaces/:wid/projects/:pid` | Update project |
| `DELETE` | `/workspaces/:wid/projects/:pid` | Archive project |

### 6.2 Folders

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/workspaces/:wid/projects/:pid/folders` | List folders in project |
| `POST` | `/workspaces/:wid/projects/:pid/folders` | Create folder |
| `PUT` | `/workspaces/:wid/projects/:pid/folders/:fid` | Rename / move folder |
| `DELETE` | `/workspaces/:wid/projects/:pid/folders/:fid` | Delete folder (files promoted to project root) |

### 6.3 Files (Sheets)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/workspaces/:wid/projects/:pid/files` | List files in project (all folders + root) |
| `POST` | `/workspaces/:wid/projects/:pid/files` | Create file |
| `GET` | `/workspaces/:wid/projects/:pid/files/:fid` | Get file metadata |
| `PUT` | `/workspaces/:wid/projects/:pid/files/:fid` | Update title, type, folderId |
| `DELETE` | `/workspaces/:wid/projects/:pid/files/:fid` | Archive file |

**Create file request body:**

```json
{
  "title": "Q3 Budget",
  "type": "SPREADSHEET",
  "folderId": "folder-uuid-or-null",
  "description": "Optional description"
}
```

---

## 7. Implementation Audit

This section checks the current CTM codebase against the requirements in this spec.

### 7.1 Schema (`apps/api-service/src/db/schema.ts`)

| Requirement | Status | Notes |
|-------------|--------|-------|
| Workspace entity | ✅ Implemented | `workspaces` table |
| Project entity | ✅ Implemented | `projects` table via PM service; `workspace_id` FK present |
| Folder entity | ✅ Implemented | `folders` table with `workspaceId`, `projectId`, `parentId` |
| File entity | ✅ Implemented | `sheets` table with `workspaceId`, `projectId`, `folderId` |
| File.projectId required | ⚠️ **Gap** | `projectId` is nullable in the current schema, allowing workspace-level files outside any project |
| Folder.projectId required | ⚠️ **Gap** | `projectId` is nullable, allowing workspace-level folders outside any project |
| Folder nesting disabled | ⚠️ **Gap** | `parentId` (self-referential FK) is present and used, enabling unlimited folder depth — this is out of scope per §2.2 |
| File type field | ⚠️ **Gap** | No `type` column on `sheets` table; file type is implicit |

### 7.2 Routes

| Requirement | Status | Notes |
|-------------|--------|-------|
| Project CRUD via API | ✅ Implemented | `apps/api-service/src/routes/pm.ts` proxies to Go PM service |
| Folder CRUD | ✅ Implemented | `apps/api-service/src/routes/folders.ts` |
| Sheet/File CRUD | ✅ Implemented | `apps/api-service/src/routes/sheets.ts` |
| File belongs to project | ⚠️ **Gap** | `projectId` is optional on sheet creation; files can be created without a project |
| Folder belongs to project | ⚠️ **Gap** | `projectId` is optional on folder creation |

### 7.3 Frontend Navigation

| Requirement | Status | Notes |
|-------------|--------|-------|
| Workspace → Project navigation | ✅ Implemented | `SidebarExplorer` shows projects per workspace |
| Project → Folder → File tree | ✅ Implemented | Sidebar renders folder/file nesting |
| Direct project files (no folder) | ✅ Implemented | Files with `!folderId` rendered at project root |
| Workspace-level "General" files | ⚠️ **Out of scope** | `SidebarExplorer` renders files with `!projectId` in a "General" section — violates the hierarchy model |

### 7.4 Roles and Privileges Audit (`apps/api-service/src/lib/permissions.ts`, `infra/postgres/migrations/`)

| Requirement | Status | Notes |
|-------------|--------|-------|
| Admin role exists | ✅ Implemented | `workspace_members` table has `OWNER`/`ADMIN` roles |
| PjM role assigned by Admin | ✅ Implemented | `workspace_pjm` table; Admin inserts rows |
| PjM can create/delete own projects | ✅ Implemented | `createdBy` check in PM service handlers |
| **PjM cannot access others' projects** | ⚠️ **Gap** | No ownership check; any PjM can query any project in the workspace |
| **PjM cannot delete others' projects** | ⚠️ **Gap** | Delete handler checks `PJM` role but not `createdBy` ownership |
| PjM accesses own folders and files | ⚠️ **Gap** | `canAccessFolder` / `canAccessSheet` check project membership, not project ownership |
| PjM assigns Manager / Member to own project | ✅ Implemented | `project_assignments` table; guarded by PjM role check |
| Manager role assigned by PjM | ✅ Implemented | `project_assignments` with `MANAGER` role |
| Manager can create/delete own folders | ⚠️ **Gap** | Folder delete checks `MANAGER` role but not `createdBy` ownership |
| **Manager cannot access others' folders** | ⚠️ **Gap** | No ownership check; any Manager in the project can read all folders |
| **Manager cannot delete others' folders** | ⚠️ **Gap** | Same — role check without ownership check |
| Manager accesses files in own folders | ⚠️ **Gap** | `canAccessSheet` uses folder membership, not folder ownership |
| Manager assigns Member to own folder | ✅ Implemented | `folder_members` table; guarded by Manager role |
| Member can create files | ✅ Implemented | File creation requires folder membership or project membership |
| Member cannot rename/move/delete files | ⚠️ **Gap** | No distinction between Member edit (content) and Manager rename/move/delete |

### 7.5 Gap Summary

| # | Gap | Severity | Recommendation |
|---|-----|----------|----------------|
| G-1 | `sheets.projectId` is nullable — files can exist without a project | High | Make `projectId` NOT NULL; migrate orphaned sheets into a default "General" project per workspace |
| G-2 | `folders.projectId` is nullable — folders can exist at workspace level | High | Make `projectId` NOT NULL; migrate or delete orphaned folders |
| G-3 | `folders.parentId` enables unlimited sub-folder nesting | Medium | Leave column for future use but enforce max depth = 1 at the API layer |
| G-4 | No `type` column on `sheets` — file type is implicit | Medium | Add `type` enum column (`SPREADSHEET`, `GRID`, `TEMPLATE`, …); default existing rows to `SPREADSHEET` |
| G-5 | Workspace-level "General" section in frontend exposes files outside hierarchy | Low | Migrate General files into a project; remove General section from sidebar |
| G-6 | PjM can access and delete projects created by other PjMs | High | Add `createdBy = currentUser` ownership check to project read/delete handlers in PM service |
| G-7 | Manager can access and delete folders created by other Managers | High | Add `createdBy = currentUser` ownership check to folder read/delete handlers in `routes/folders.ts` |
| G-8 | PjM/Manager access to children (folders/files) is checked by role, not ownership | High | Replace role-only checks in `permissions.ts` with ownership-aware checks (walk `createdBy` chain) |
| G-9 | No distinction between Member file-content edit and Manager file rename/move/delete | Medium | Add `canManageFile` (Manager+) vs. `canEditFile` (Member+) guard in `routes/sheets.ts` |

---

## 8. Migration Plan (for Gap Resolution)

### Step 1 — Add file type column

```sql
-- infra/postgres/migrations/XXX_file_type.sql
ALTER TABLE sheets
  ADD COLUMN type TEXT NOT NULL DEFAULT 'SPREADSHEET'
  CHECK (type IN ('SPREADSHEET','GRID','TEMPLATE','FORM','DASHBOARD'));
```

### Step 2 — Create default projects for orphaned files

```sql
-- For each workspace that has sheets/folders with NULL projectId,
-- create a "General" project and reassign.
INSERT INTO projects (id, workspace_id, name, status, created_by, created_at)
SELECT gen_random_uuid(), w.id, 'General', 'ACTIVE', w.owner_id, NOW()
FROM workspaces w
WHERE EXISTS (
  SELECT 1 FROM sheets s WHERE s.workspace_id = w.id AND s.project_id IS NULL
);

UPDATE sheets s
SET project_id = p.id
FROM projects p
WHERE p.workspace_id = s.workspace_id
  AND p.name = 'General'
  AND s.project_id IS NULL;

-- Same for folders
UPDATE folders f
SET project_id = p.id
FROM projects p
WHERE p.workspace_id = f.workspace_id
  AND p.name = 'General'
  AND f.project_id IS NULL;
```

### Step 3 — Enforce NOT NULL at schema level

```sql
ALTER TABLE sheets ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE folders ALTER COLUMN project_id SET NOT NULL;
```

### Step 4 — Enforce max folder depth at API layer

In `apps/api-service/src/routes/folders.ts`, reject folder creation if `parentId` is provided:

```typescript
if (body.parentId) {
  return reply.code(400).send({
    error: { code: 'FOLDER_NESTING_NOT_SUPPORTED', message: 'Folders cannot be nested.' }
  })
}
```

### Step 5 — Add ownership checks to project handlers (G-6)

In the PM service (`apps/pm-service/internal/handlers/projects.go`), add a `createdBy` ownership check for read, update, and delete:

```go
// GET /projects/:id
if project.CreatedBy != currentUserID && !isAdmin(currentUser) {
    http.Error(w, "forbidden", http.StatusForbidden)
    return
}

// DELETE /projects/:id
if project.CreatedBy != currentUserID && !isAdmin(currentUser) {
    http.Error(w, "forbidden", http.StatusForbidden)
    return
}
```

### Step 6 — Add ownership checks to folder handlers (G-7)

In `apps/api-service/src/routes/folders.ts`, add ownership check before delete and read:

```typescript
// DELETE /folders/:id and PUT /folders/:id
const folder = await db.query.folders.findFirst({ where: eq(folders.id, folderId) })
if (folder.createdBy !== request.ctx.userId && !isAdmin(request.ctx)) {
  return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'You can only manage folders you created.' } })
}
```

### Step 7 — Update permissions.ts with ownership-aware checks (G-8, G-9)

In `apps/api-service/src/lib/permissions.ts`:

```typescript
// canManageFile: Manager of owning folder, PjM of owning project, or Admin
export async function canManageFile(db, ctx, file) {
  if (isAdmin(ctx)) return true
  const project = await db.query.projects.findFirst({ where: eq(projects.id, file.projectId) })
  if (project.createdBy === ctx.userId) return true  // PjM ownership
  if (file.folderId) {
    const folder = await db.query.folders.findFirst({ where: eq(folders.id, file.folderId) })
    if (folder.createdBy === ctx.userId) return true  // Manager ownership
  }
  return false
}

// canEditFile: Member of folder, Manager, PjM, or Admin
export async function canEditFile(db, ctx, file) {
  if (await canManageFile(db, ctx, file)) return true
  // Check folder membership
  if (file.folderId) {
    const membership = await db.query.folderMembers.findFirst({
      where: and(eq(folderMembers.folderId, file.folderId), eq(folderMembers.userId, ctx.userId))
    })
    if (membership) return true
  }
  return false
}
```

---

## 9. Open Questions

| # | Question | Owner |
|---|----------|-------|
| OQ-1 | Should folder nesting (sub-folders) be supported in a future milestone? If yes, what is the maximum depth? | Product |
| OQ-2 | Should Templates be a separate entity (not a file type) to support versioning and publishing? | Product |
| OQ-3 | What happens to files in a deleted folder — promote to project root or archive? | Engineering |
| OQ-4 | Should workspaces ever contain files/folders directly (without a project) for personal/scratch use? | Product |

---

## 10. Related Documents

- [SPEC-001: Sheets](SPEC-001-sheets.md)
- [SPEC-002: Formulas](SPEC-002-formulas.md)
- [Access Control + Role-Based Permissions](../Access%20Control%20+%20Role-Based%20Permissions.md)
- [Project Creation & Member Assignment UI](../Project%20Creation%20%26%20Member%20Assignment%20UI.md)
- [ADR-004: Microservices Architecture](../architecture/ADRs/)
