# Implementation Plan - Access Control & Role-Based Permissions (Admin > PjM > Manager > Member)

This plan details how to implement the Workspace, Project, Folder, and File access privileges based on the hierarchical roles: `Admin > PjM > Manager > Member`.

## User Review Required

> [!IMPORTANT]
> To support the requested access privilege model, we will introduce database schema migrations for role assignments, update backend routes in `api-service`, and update UI controls in `SidebarExplorer`.

## Proposed Changes

### 1. Database Schema Updates
We need to model the relationships between Workspaces, Projects, Folders, and their corresponding roles (`PjM`, `Manager`, `Member`).

#### Workspace Level
- Add a table `workspace_pjm` mapping `workspace_id` to `user_id` (`PjM` of Workspace).
- `Admin` (system/workspace owners) can manage these mappings.

#### Project Level
- Add a `created_by` field to `pm.projects` (UUID referencing `users.id`) to track the creator `PjM`.
- Add a table `project_assignments` with fields:
  - `project_id` (UUID references `pm.projects.id`)
  - `user_id` (UUID references `users.id`)
  - `role` (enum: `'MANAGER'`, `'MEMBER'`)
- Creator `PjM` can assign `Manager` and `Member` to the Project.

#### Folder Level
- Modify `folders` table to add:
  - `project_id` (UUID references `pm.projects.id`)
  - `created_by` (UUID references `users.id`)
- Add a table `folder_members` mapping `folder_id` to `user_id` (`Member` assigned to Folder).
- Creator `Manager` can assign `Member`s to Folder.

### 2. Backend Authorization Rules (Fastify Middleware/Routes)
Modify `api-service` to enforce the following checks:

- **Workspace Access**:
  - `Admin` has unrestricted access.
  - `PjM` has access only if designated in `workspace_pjm`.
- **Project Access**:
  - `PjM` can only read/write/delete projects they created (`created_by` matching user id). They cannot access others' projects.
  - `Manager` and `Member` can read projects only if assigned in `project_assignments`.
- **Folder Access**:
  - `Manager` can create/delete folders. They can only access/delete folders they created (`created_by` matching user id).
  - `Member` can only access folders they are assigned to in `folder_members`.
- **File Access**:
  - Users can create files.
  - Reading/writing files requires access to the parent folder/project based on the assignments.

### 3. Frontend Explorer Customization (`SidebarExplorer.tsx`)
- Adapt tree views to load and render only projects, folders, and sheets matching the user's role-based permissions.
- Hide "Create Project", "Create Folder", and "Delete" operations for users without the requisite privileges.

## Verification Plan

### Automated Tests
- Verify that backend queries enforce RLS or query filters matching user credentials.
- Run `pnpm --filter frontend build` to verify frontend compiles.

### Manual Verification
- Log in as different roles (`Admin`, `PjM`, `Manager`, `Member`) and verify Workspace, Project, and Folder actions inside the Explorer UI.
