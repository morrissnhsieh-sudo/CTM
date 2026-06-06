# Implementation Plan - Project Creation & Member Assignment UI

Introduce project creation capabilities in the Workspace Explorer sidebar and File menu, and add a member assignment UI for Admin, PjM, and Manager roles to manage Project and Folder access permissions.

## User Review Required

> [!IMPORTANT]
> - Workspace projects can only be created by **Admin** or **PjM** roles.
> - Project members can be set by **Admin**, **PjM**, or the **Project Manager** (creator or manager assignment).
> - Folder members can be set by **Admin**, parent **Project Manager**, or the folder creator (**Manager**).
> - We will introduce backend endpoints to fetch and update members, and retrieve users for authorization checks.

## Proposed Changes

### [Backend Components]

#### [MODIFY] [users.ts](file:///c:/Users/User/Code/CTM/apps/api-service/src/routes/users.ts)
- Modify `GET /` (list users) authorization logic: relax the check from `ADMIN`-only to `EDITOR` or above so that Project Managers (who have the `EDITOR` role) and workspace PJMs can fetch the workspace users list.

#### [MODIFY] [pm.ts](file:///c:/Users/User/Code/CTM/apps/api-service/src/routes/pm.ts)
- Enforce check in `POST /` (create project) proxy endpoint: verify that the requesting user is either an `ADMIN`/`OWNER` or a registered `PjM` for the current workspace.
- Implement `GET /:projectId/members`: returns list of users assigned to project along with their project role (`MANAGER` / `MEMBER`).
- Implement `PUT /:projectId/members`: deletes existing assignments and updates project assignments with the provided list of users and roles.

#### [MODIFY] [folders.ts](file:///c:/Users/User/Code/CTM/apps/api-service/src/routes/folders.ts)
- Implement `GET /:folderId/members`: returns list of users assigned to folder.
- Implement `PUT /:folderId/members`: deletes existing assignments and updates folder members with the provided list of user IDs.

---

### [Frontend Components]

#### [MODIFY] [api.ts](file:///c:/Users/User/Code/CTM/apps/frontend/src/lib/api.ts)
- Add API clients under `pm` namespace:
  - `getProjectMembers(projectId, opts)`
  - `updateProjectMembers(projectId, body, opts)`
- Add API clients under `folders` namespace:
  - `getFolderMembers(folderId, opts)`
  - `updateFolderMembers(folderId, body, opts)`

#### [NEW] [ManageMembersModal.tsx](file:///c:/Users/User/Code/CTM/apps/frontend/src/components/navigation/ManageMembersModal.tsx)
- Implement a modal dialog to select, add, and remove workspace members for a specific Project or Folder.
- For Projects: includes role selection (`MANAGER` vs `MEMBER`).
- For Folders: includes simple list selection of users who have access.

#### [MODIFY] [SidebarExplorer.tsx](file:///c:/Users/User/Code/CTM/apps/frontend/src/components/navigation/SidebarExplorer.tsx)
- Add a "New Project" button in the Explorer Header (visible for Admin and workspace PjMs).
- Add "Manage Members" to the action menus for Projects and Folders in the Explorer Tree.
- Integrate the `ManageMembersModal`.

#### [MODIFY] [SheetToolbar.tsx](file:///c:/Users/User/Code/CTM/apps/frontend/src/components/grid/SheetToolbar.tsx)
- Add "New Project..." entry to the "File" dropdown menu.
- Integrate project creation dialog trigger.

## Verification Plan

### Automated/Manual Tests
- Log in as **Admin** (`admin@ctm.app`) -> Verify that "New Project" option is visible in both the sidebar and the File menu, and projects/folders can have their members managed.
- Log in as **PjM** (`pjm@ctm.app`) -> Verify project creation and member management.
- Log in as **Manager** (`manager@ctm.app`) -> Verify folder member management is allowed, but project creation is blocked.
- Log in as **Member** (`member@ctm.app`) -> Verify that project creation and member management menus are hidden/inaccessible.
