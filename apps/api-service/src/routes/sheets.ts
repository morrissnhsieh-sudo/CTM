import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { sheets, columns, rows } from '../db/schema.js'
import { withRls, paginated, selectFields } from '../db/helpers.js'
import { hasMinRole } from '@ctm/shared-types'
import { v4 as uuid } from 'uuid'

const CreateSheetBody = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  projectId: z.string().uuid().optional(),
})

const UpdateSheetBody = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional().nullable(),
  settings: z.record(z.unknown()).optional(),
})

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

    const filtered = selectFields(result, fields)
    return paginated(filtered, filtered.length, page, pageSize, request.id as string)
  })

  // POST /sheets — create sheet
  app.post('/', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'EDITOR')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'EDITOR role required', requestId: request.id } })
    }

    const body = CreateSheetBody.parse(request.body)
    const sheetId = uuid()

    const [sheet] = await withRls(app.db, request, async (tx) => {
      const [s] = await tx
        .insert(sheets)
        .values({
          id: sheetId,
          workspaceId: request.ctx.workspaceId,
          title: body.title,
          description: body.description ?? null,
          projectId: body.projectId ?? null,
          createdBy: request.ctx.userId,
        })
        .returning()

      // Create default columns
      const defaultCols = [
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

    const result = await withRls(app.db, request, async (tx) =>
      tx
        .select()
        .from(sheets)
        .where(and(eq(sheets.id, id), eq(sheets.workspaceId, request.ctx.workspaceId)))
        .limit(1),
    )

    if (!result[0]) {
      return reply.code(404).send({ error: { code: 'SHEET_NOT_FOUND', message: `Sheet ${id} not found`, requestId: request.id } })
    }

    return { data: selectFields(result[0], fields), requestId: request.id }
  })

  // PUT /sheets/:id
  app.put('/:id', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'ADMIN')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'ADMIN role required', requestId: request.id } })
    }

    const { id } = request.params as { id: string }
    const body = UpdateSheetBody.parse(request.body)

    const [updated] = await withRls(app.db, request, async (tx) =>
      tx
        .update(sheets)
        .set({
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.settings !== undefined && { settings: body.settings }),
          updatedAt: new Date(),
        })
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
    if (!hasMinRole(request.ctx.role, 'ADMIN')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'ADMIN role required', requestId: request.id } })
    }

    const { id } = request.params as { id: string }

    const [deleted] = await withRls(app.db, request, async (tx) =>
      tx
        .update(sheets)
        .set({ archivedAt: new Date() })
        .where(and(eq(sheets.id, id), eq(sheets.workspaceId, request.ctx.workspaceId)))
        .returning(),
    )

    if (!deleted) {
      return reply.code(404).send({ error: { code: 'SHEET_NOT_FOUND', message: `Sheet ${id} not found`, requestId: request.id } })
    }

    reply.code(204)
  })
}
