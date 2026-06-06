import type { FastifyRequest } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { workspacePjm, projectAssignments, folderMembers, folders, sheets } from '../db/schema.js'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '../db/schema.js'

type DB = NodePgDatabase<typeof schema>

// ─── Workspace role helpers ───────────────────────────────────────────────────

export async function isAdmin(request: FastifyRequest): Promise<boolean> {
  const role = request.ctx.role
  return role === 'ADMIN' || role === 'OWNER'
}

export async function isPjm(db: DB, request: FastifyRequest): Promise<boolean> {
  if (await isAdmin(request)) return true

  const pjmRecord = await db
    .select()
    .from(workspacePjm)
    .where(
      and(
        eq(workspacePjm.workspaceId, request.ctx.workspaceId),
        eq(workspacePjm.userId, request.ctx.userId)
      )
    )
    .limit(1)

  return pjmRecord.length > 0
}

// ─── Project helpers ──────────────────────────────────────────────────────────

// Returns the project row from pm.projects (id, created_by).
// Uses a raw query because pm.projects lives in the pm schema, outside Drizzle tables.
async function getProjectCreatedBy(
  db: DB,
  projectId: string,
  workspaceId: string,
): Promise<string | null> {
  const rows = await db.execute(
    `SELECT created_by FROM pm.projects WHERE id = '${projectId}' AND workspace_id = '${workspaceId}'`
  ) as unknown as Array<{ created_by: string | null }>

  return rows[0]?.created_by ?? null
}

// A user can ACCESS a project if:
//   - they are Admin, OR
//   - they CREATED the project (PjM ownership), OR
//   - they are assigned to it (Manager / Member role)
export async function canAccessProject(db: DB, request: FastifyRequest, projectId: string): Promise<boolean> {
  if (await isAdmin(request)) return true

  const createdBy = await getProjectCreatedBy(db, projectId, request.ctx.workspaceId)
  if (createdBy === request.ctx.userId) return true

  const assignment = await db
    .select()
    .from(projectAssignments)
    .where(
      and(
        eq(projectAssignments.projectId, projectId),
        eq(projectAssignments.userId, request.ctx.userId)
      )
    )
    .limit(1)

  return assignment.length > 0
}

// A user can MANAGE (update/delete) a project only if:
//   - they are Admin, OR
//   - they CREATED the project (PjM ownership — spec §5.3 rule 1)
export async function canManageProject(db: DB, request: FastifyRequest, projectId: string): Promise<boolean> {
  if (await isAdmin(request)) return true

  const createdBy = await getProjectCreatedBy(db, projectId, request.ctx.workspaceId)
  return createdBy === request.ctx.userId
}

// isProjectManager: used only when granting folder-creation rights.
// True for Admin, the PjM who owns the project, or a user with MANAGER assignment.
export async function isProjectManager(db: DB, request: FastifyRequest, projectId: string): Promise<boolean> {
  if (await isAdmin(request)) return true
  if (await canManageProject(db, request, projectId)) return true

  const assignment = await db
    .select()
    .from(projectAssignments)
    .where(
      and(
        eq(projectAssignments.projectId, projectId),
        eq(projectAssignments.userId, request.ctx.userId),
        eq(projectAssignments.role, 'MANAGER')
      )
    )
    .limit(1)

  return assignment.length > 0
}

// ─── Folder helpers ───────────────────────────────────────────────────────────

// A user can ACCESS a folder if:
//   - they are Admin, OR
//   - they are the PjM who CREATED the folder's parent project (spec §5.3 rule 2), OR
//   - they CREATED the folder (Manager ownership — spec §5.4 rule 3), OR
//   - they are a Member of the folder (spec §5.5)
export async function canAccessFolder(db: DB, request: FastifyRequest, folderId: string): Promise<boolean> {
  if (await isAdmin(request)) return true

  const [folder] = await db
    .select()
    .from(folders)
    .where(eq(folders.id, folderId))
    .limit(1)

  if (!folder) return false

  // PjM who owns the parent project has full access to all its folders
  const projectCreatedBy = await getProjectCreatedBy(db, folder.projectId, request.ctx.workspaceId)
  if (projectCreatedBy === request.ctx.userId) return true

  // Manager who created this folder has access
  if (folder.createdBy === request.ctx.userId) return true

  // Folder members have access
  const member = await db
    .select()
    .from(folderMembers)
    .where(
      and(
        eq(folderMembers.folderId, folderId),
        eq(folderMembers.userId, request.ctx.userId)
      )
    )
    .limit(1)

  return member.length > 0
}

// A user can MANAGE (rename/delete/assign members) a folder if:
//   - they are Admin, OR
//   - they are the PjM who CREATED the folder's parent project (spec §5.3 rule 2), OR
//   - they CREATED the folder (Manager ownership — spec §5.4 rule 1)
//
// Note: a MANAGER assigned to the project but who did NOT create this folder
// cannot manage it (spec §5.4 rule 1: "only folders they personally created").
export async function canManageFolder(db: DB, request: FastifyRequest, folderId: string): Promise<boolean> {
  if (await isAdmin(request)) return true

  const [folder] = await db
    .select()
    .from(folders)
    .where(eq(folders.id, folderId))
    .limit(1)

  if (!folder) return false

  // PjM who owns the parent project can manage all its folders
  const projectCreatedBy = await getProjectCreatedBy(db, folder.projectId, request.ctx.workspaceId)
  if (projectCreatedBy === request.ctx.userId) return true

  // Only the folder creator can manage it
  return folder.createdBy === request.ctx.userId
}

// ─── Sheet / File helpers ─────────────────────────────────────────────────────

// canAccessSheet: read access.
//   Admin > PjM (project owner) > Manager (folder owner) > folder Member > sheet creator
export async function canAccessSheet(db: DB, request: FastifyRequest, sheetId: string): Promise<boolean> {
  if (await isAdmin(request)) return true

  const [sheet] = await db
    .select()
    .from(sheets)
    .where(eq(sheets.id, sheetId))
    .limit(1)

  if (!sheet) return false

  // PjM who owns the project
  const projectCreatedBy = await getProjectCreatedBy(db, sheet.projectId, request.ctx.workspaceId)
  if (projectCreatedBy === request.ctx.userId) return true

  // Access via folder (Manager owner or folder Member)
  if (sheet.folderId) return canAccessFolder(db, request, sheet.folderId)

  // Sheet creator fallback
  return sheet.createdBy === request.ctx.userId
}

// canEditFileContent: content-level write (description, settings).
//   Same as canAccessSheet — Members are permitted to edit content.
export async function canEditFileContent(db: DB, request: FastifyRequest, sheetId: string): Promise<boolean> {
  return canAccessSheet(db, request, sheetId)
}

// canWriteSheet: structural write (rename title, move folderId/projectId, delete).
//   Admin > PjM (project owner) > Manager (folder owner)
//   Members are NOT permitted structural operations (spec §5.5).
export async function canWriteSheet(db: DB, request: FastifyRequest, sheetId: string): Promise<boolean> {
  if (await isAdmin(request)) return true

  const [sheet] = await db
    .select()
    .from(sheets)
    .where(eq(sheets.id, sheetId))
    .limit(1)

  if (!sheet) return false

  // Sheet creator (typically the Member who made it) can manage their own file
  if (sheet.createdBy === request.ctx.userId) return true

  // PjM who owns the project
  const projectCreatedBy = await getProjectCreatedBy(db, sheet.projectId, request.ctx.workspaceId)
  if (projectCreatedBy === request.ctx.userId) return true

  // Manager who owns the parent folder
  if (sheet.folderId) return canManageFolder(db, request, sheet.folderId)

  return false
}
