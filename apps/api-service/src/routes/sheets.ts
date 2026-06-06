import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and, isNull, desc } from 'drizzle-orm'
import crypto from 'node:crypto'
import { sheets, columns, rows, cells, folders, userSheetInteractions, sharing } from '../db/schema.js'
import { withRls, paginated, selectFields } from '../db/helpers.js'
import { hasMinRole } from '@ctm/shared-types'
import { v4 as uuid } from 'uuid'
import {
  isAdmin,
  canAccessSheet,
  canEditFileContent,
  canWriteSheet
} from '../lib/permissions.js'

import { env } from '../env.js'

const FILE_TYPES = ['SPREADSHEET', 'GRID', 'TEMPLATE', 'FORM', 'DASHBOARD'] as const

const CreateSheetBody = z.object({
  title: z.string().min(1).max(255),
  type: z.enum(FILE_TYPES).default('SPREADSHEET'),
  description: z.string().max(1000).optional(),
  projectId: z.string().uuid().optional().nullable(),
  folderId: z.string().uuid().optional().nullable(),
  mode: z.enum(['grid', 'project']).optional(),
})

// Structural fields — require canWriteSheet (Manager+)
const StructuralUpdateBody = z.object({
  title: z.string().min(1).max(255).optional(),
  folderId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
})

// Content fields — require canEditFileContent (Member+)
const ContentUpdateBody = z.object({
  description: z.string().max(1000).optional().nullable(),
  settings: z.record(z.unknown()).optional(),
})

const UpdateSheetBody = StructuralUpdateBody.merge(ContentUpdateBody)

export const sheetsRouter: FastifyPluginAsync = async (app) => {
  // GET /sheets — list workspace sheets
  // ?fields=id,title,updatedAt  — field selection (Smartsheet-compatible)
  app.get('/', async (request, reply) => {
    const {
      page     = 1,
      pageSize = 100,
      fields,
    } = request.query as { page?: number; pageSize?: number; fields?: string }
    const offset = (page - 1) * Math.min(pageSize, 500)

    const userIsAdmin = await isAdmin(request)

    const result = await withRls(app.db, request, async (tx) =>
      tx
        .select()
        .from(sheets)
        .where(and(
          eq(sheets.workspaceId, request.ctx.workspaceId),
          isNull(sheets.archivedAt),
        ))
        .orderBy(desc(sheets.updatedAt))
        .limit(Math.min(pageSize, 500))
        .offset(offset),
    )

    const allowedSheets = []
    for (const sheet of result) {
      if (userIsAdmin || await canAccessSheet(app.db, request, sheet.id)) {
        allowedSheets.push(sheet)
      }
    }

    const filtered = selectFields(allowedSheets, fields)
    return paginated(filtered, filtered.length, page, pageSize, request.id as string)
  })

  // GET /sheets/favorites — list user's favorite sheets
  app.get('/favorites', async (request, reply) => {
    const userIsAdmin = await isAdmin(request)

    const result = await withRls(app.db, request, async (tx) =>
      tx
        .select({
          id: sheets.id,
          title: sheets.title,
          description: sheets.description,
          updatedAt: sheets.updatedAt,
          folderId: sheets.folderId,
        })
        .from(sheets)
        .innerJoin(
          userSheetInteractions,
          and(
            eq(sheets.id, userSheetInteractions.sheetId),
            eq(userSheetInteractions.userId, request.ctx.userId),
            eq(userSheetInteractions.isFavorite, true),
          ),
        )
        .where(and(
          eq(sheets.workspaceId, request.ctx.workspaceId),
          isNull(sheets.archivedAt),
        ))
        .orderBy(desc(sheets.updatedAt)),
    )

    const allowedSheets = []
    for (const sheet of result) {
      if (userIsAdmin || await canAccessSheet(app.db, request, sheet.id)) {
        allowedSheets.push(sheet)
      }
    }

    return { data: allowedSheets, requestId: request.id }
  })

  // GET /sheets/recents — list user's recently accessed sheets
  app.get('/recents', async (request, reply) => {
    const userIsAdmin = await isAdmin(request)

    const result = await withRls(app.db, request, async (tx) =>
      tx
        .select({
          id: sheets.id,
          title: sheets.title,
          description: sheets.description,
          updatedAt: sheets.updatedAt,
          folderId: sheets.folderId,
          lastReadAt: userSheetInteractions.lastReadAt,
        })
        .from(sheets)
        .innerJoin(
          userSheetInteractions,
          and(
            eq(sheets.id, userSheetInteractions.sheetId),
            eq(userSheetInteractions.userId, request.ctx.userId),
          ),
        )
        .where(and(
          eq(sheets.workspaceId, request.ctx.workspaceId),
          isNull(sheets.archivedAt),
        ))
        .orderBy(desc(userSheetInteractions.lastReadAt))
        .limit(10),
    )

    const allowedSheets = []
    for (const sheet of result) {
      if (userIsAdmin || await canAccessSheet(app.db, request, sheet.id)) {
        allowedSheets.push(sheet)
      }
    }

    return { data: allowedSheets, requestId: request.id }
  })

  // POST /sheets/:id/favorite — toggle favorite status
  app.post('/:id/favorite', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ isFavorite: z.boolean() }).parse(request.body)

    if (!(await canAccessSheet(app.db, request, id))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden: access denied', requestId: request.id } })
    }

    await withRls(app.db, request, async (tx) => {
      await tx
        .insert(userSheetInteractions)
        .values({
          userId: request.ctx.userId,
          sheetId: id,
          isFavorite: body.isFavorite,
          lastReadAt: new Date(),
        } as any)
        .onConflictDoUpdate({
          target: [userSheetInteractions.userId, userSheetInteractions.sheetId],
          set: { isFavorite: body.isFavorite } as any,
        })
    })

    return { success: true, requestId: request.id }
  })

  // POST /sheets — create sheet
  app.post('/', async (request, reply) => {
    // Users has the privilege to create files.
    const body = CreateSheetBody.parse(request.body)
    const sheetId = uuid()
    const isProjectMode = body.mode === 'project' || body.type === 'GRID'

    let projectId = body.projectId
    if (!projectId) {
      // Create a project in PM Service
      const pmUrl = `http://${env.PM_GRPC_HOST.replace(':50051', ':8080')}/v1/projects`
      try {
        const res = await fetch(pmUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Workspace-Id': request.ctx.workspaceId,
            'X-User-Id': request.ctx.userId,
            'X-User-Role': request.ctx.role,
            'X-Client-Cert-CN': 'api-service',
          },
          body: JSON.stringify({ name: body.title }),
        })
        if (res.ok) {
          const pmRes = await res.json() as { data?: { id: string } }
          projectId = pmRes.data?.id
        } else {
          app.log.error(`PM service returned ${res.status} when creating project`)
        }
      } catch (err) {
        app.log.error(err, 'Failed to create project in PM service')
      }

      // Fallback in case PM service is offline
      if (!projectId) {
        projectId = uuid()
      }
    }

    const [sheet] = await withRls(app.db, request, async (tx) => {
      const [s] = await tx
        .insert(sheets)
        .values({
          id: sheetId,
          workspaceId: request.ctx.workspaceId,
          projectId: projectId,
          title: body.title,
          type: isProjectMode ? 'GRID' : body.type,
          ...(body.description !== undefined && body.description !== null && { description: body.description }),
          ...(body.folderId !== undefined && { folderId: body.folderId }),
          createdBy: request.ctx.userId,
        } as any)
        .returning()

      // Create default columns
      const defaultCols = isProjectMode
        ? [
            { id: uuid(), sheetId, name: 'Task Name', type: 'text', position: 0, width: 200 },
            { id: uuid(), sheetId, name: 'Start Date', type: 'date', position: 1, width: 130 },
            { id: uuid(), sheetId, name: 'Finish Date', type: 'date', position: 2, width: 130 },
            { id: uuid(), sheetId, name: 'Predecessors', type: 'text', position: 3, width: 150 },
          ]
        : [
            { id: uuid(), sheetId, name: 'Name', type: 'text', position: 0, width: 200 },
            { id: uuid(), sheetId, name: 'Status', type: 'dropdown', position: 1, width: 150, format: { dropdownOptions: [{ label: 'Not Started', color: '#9CA3AF' }, { label: 'In Progress', color: '#3B82F6' }, { label: 'Done', color: '#10B981' }] } },
            { id: uuid(), sheetId, name: 'Assignee', type: 'contact', position: 2, width: 150 },
            { id: uuid(), sheetId, name: 'Due Date', type: 'date', position: 3, width: 130 },
          ]

      await tx.insert(columns).values(defaultCols)

      return [s]
    })

    reply.code(201)
    return { data: sheet, requestId: request.id }
  })

  // GET /sheets/:id
  // ?fields=id,title,columns  — field selection (Smartsheet-compatible)
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { fields } = request.query as { fields?: string }

    if (!(await canAccessSheet(app.db, request, id))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden: sheet access denied', requestId: request.id } })
    }

    const result = await withRls(app.db, request, async (tx) => {
      const sheetsResult = await tx
        .select()
        .from(sheets)
        .where(and(eq(sheets.id, id), eq(sheets.workspaceId, request.ctx.workspaceId)))
        .limit(1)

      if (sheetsResult[0]) {
        // Log user interaction
        await tx
          .insert(userSheetInteractions)
          .values({
            userId: request.ctx.userId,
            sheetId: id,
            isFavorite: false,
            lastReadAt: new Date(),
          } as any)
          .onConflictDoUpdate({
            target: [userSheetInteractions.userId, userSheetInteractions.sheetId],
            set: { lastReadAt: new Date() } as any,
          })
      }

      return sheetsResult
    })

    if (!result[0]) {
      return reply.code(404).send({ error: { code: 'SHEET_NOT_FOUND', message: `Sheet ${id} not found`, requestId: request.id } })
    }

    return { data: selectFields(result[0], fields), requestId: request.id }
  })

  // PUT /sheets/:id
  // Structural fields (title, folderId, projectId) require Manager+ (canWriteSheet).
  // Content fields (description, settings) require Member+ (canEditFileContent).
  app.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = UpdateSheetBody.parse(request.body)

    const hasStructural = body.title !== undefined || body.folderId !== undefined || body.projectId !== undefined
    const hasContent    = body.description !== undefined || body.settings !== undefined

    if (hasStructural && !(await canWriteSheet(app.db, request, id))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Rename/move requires Manager or above', requestId: request.id } })
    }

    if (hasContent && !hasStructural && !(await canEditFileContent(app.db, request, id))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden: file access denied', requestId: request.id } })
    }

    const [updated] = await withRls(app.db, request, async (tx) =>
      tx
        .update(sheets)
        .set({
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.projectId !== undefined && { projectId: body.projectId }),
          ...(body.settings !== undefined && { settings: body.settings }),
          ...(body.folderId !== undefined && { folderId: body.folderId }),
          updatedAt: new Date(),
        } as any)
        .where(and(eq(sheets.id, id), eq(sheets.workspaceId, request.ctx.workspaceId)))
        .returning(),
    )

    if (!updated) {
      return reply.code(404).send({ error: { code: 'SHEET_NOT_FOUND', message: `Sheet ${id} not found`, requestId: request.id } })
    }

    return { data: updated, requestId: request.id }
  })

  // DELETE /sheets/:id
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    if (!(await canWriteSheet(app.db, request, id))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden: sheet write privilege required', requestId: request.id } })
    }

    const [deleted] = await withRls(app.db, request, async (tx) =>
      tx
        .update(sheets)
        // @ts-ignore -- Drizzle v0.41: PgUpdateSetSource excludes defaulted/nullable columns
        .set({ archivedAt: new Date() })
        .where(and(eq(sheets.id, id), eq(sheets.workspaceId, request.ctx.workspaceId)))
        .returning(),
    )

    if (!deleted) {
      return reply.code(404).send({ error: { code: 'SHEET_NOT_FOUND', message: `Sheet ${id} not found`, requestId: request.id } })
    }

    reply.code(204)
  })

  // POST /sheets/:id/share/public
  app.post('/:id/share/public', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      visibleColIds: z.array(z.string().uuid()).optional().nullable(),
      expiresAt: z.string().datetime().optional().nullable(),
    }).parse(request.body)

    if (!(await canWriteSheet(app.db, request, id))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden: sheet write privilege required', requestId: request.id } })
    }

    const publicToken = crypto.randomBytes(32).toString('hex')

    const [record] = await withRls(app.db, request, async (tx) =>
      tx.insert(sharing).values({
        id: uuid(),
        resourceType: 'sheet',
        resourceId: id,
        principalType: 'public',
        principalId: null,
        role: 'VIEWER',
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        publicToken,
        visibleColIds: body.visibleColIds || null,
      } as any).returning()
    )

    return {
      data: {
        token: publicToken,
        sharing: record,
      },
      requestId: request.id,
    }
  })

  // GET /sheets/:id/share/public
  app.get('/:id/share/public', async (request, reply) => {
    const { id } = request.params as { id: string }
    if (!(await canAccessSheet(app.db, request, id))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden: sheet access denied', requestId: request.id } })
    }

    const records = await withRls(app.db, request, async (tx) =>
      tx.select().from(sharing).where(and(
        eq(sharing.resourceType, 'sheet'),
        eq(sharing.resourceId, id),
        eq(sharing.principalType, 'public')
      ))
    )

    return { data: records, requestId: request.id }
  })

  // DELETE /sheets/:id/share/public
  app.delete('/:id/share/public', async (request, reply) => {
    const { id } = request.params as { id: string }
    if (!(await canWriteSheet(app.db, request, id))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden: sheet write privilege required', requestId: request.id } })
    }

    await withRls(app.db, request, async (tx) =>
      tx.delete(sharing).where(and(
        eq(sharing.resourceType, 'sheet'),
        eq(sharing.resourceId, id),
        eq(sharing.principalType, 'public')
      ))
    )

    return { success: true, requestId: request.id }
  })

  // GET /sheets/shared/:token
  app.get('/shared/:token', async (request, reply) => {
    const { token } = request.params as { token: string }

    const [sharingRecord] = await app.db
      .select()
      .from(sharing)
      .where(and(
        eq(sharing.publicToken, token),
        eq(sharing.principalType, 'public')
      ))
      .limit(1)

    if (!sharingRecord) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Shared view not found', requestId: request.id } })
    }

    if (sharingRecord.expiresAt && new Date(sharingRecord.expiresAt) < new Date()) {
      return reply.code(410).send({ error: { code: 'GONE', message: 'Shared view has expired', requestId: request.id } })
    }

    const sheetId = sharingRecord.resourceId

    const [sheet] = await app.db
      .select()
      .from(sheets)
      .where(eq(sheets.id, sheetId))
      .limit(1)

    if (!sheet) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Sheet not found', requestId: request.id } })
    }

    let allColumns = await app.db
      .select()
      .from(columns)
      .where(eq(columns.sheetId, sheetId))

    const visibleColIds = sharingRecord.visibleColIds
    if (visibleColIds && visibleColIds.length > 0) {
      const whitelist = new Set(visibleColIds)
      allColumns = allColumns.filter(col => whitelist.has(col.id))
    }

    const columnIds = allColumns.map(col => col.id)

    const allRows = await app.db
      .select()
      .from(rows)
      .where(and(eq(rows.sheetId, sheetId), isNull(rows.deletedAt)))

    let allCells: any[] = []
    if (columnIds.length > 0) {
      const { inArray } = await import('drizzle-orm')
      allCells = await app.db
        .select()
        .from(cells)
        .where(inArray(cells.colId, columnIds))
    }

    return {
      data: {
        sheet: {
          id: sheet.id,
          title: sheet.title,
          description: sheet.description,
          type: sheet.type,
          settings: sheet.settings,
        },
        columns: allColumns,
        rows: allRows,
        cells: allCells,
      },
      requestId: request.id,
    }
  })
}

