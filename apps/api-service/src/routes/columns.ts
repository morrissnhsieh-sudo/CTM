import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and, asc } from 'drizzle-orm'
import { columns, sheets } from '../db/schema.js'
import { withRls } from '../db/helpers.js'
import { hasMinRole } from '@ctm/shared-types'
import { v4 as uuid } from 'uuid'

const CreateColumnBody = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['text','number','currency','date','datetime','checkbox','dropdown',
    'multi_select','attachment','formula','url','contact','auto_number','ai_generated']),
  position: z.number().int().nonnegative().optional(),
  width: z.number().int().min(40).max(2000).optional(),
  format: z.record(z.unknown()).optional(),
  validation: z.record(z.unknown()).nullable().optional(),
})

const UpdateColumnBody = CreateColumnBody.partial()

export const columnsRouter: FastifyPluginAsync = async (app) => {
  // GET /sheets/:sheetId/columns
  app.get('/:sheetId/columns', async (request, reply) => {
    const { sheetId } = request.params as { sheetId: string }

    const cols = await withRls(app.db, request, async (tx) => {
      const [sheet] = await tx.select({ id: sheets.id }).from(sheets)
        .where(and(eq(sheets.id, sheetId), eq(sheets.workspaceId, request.ctx.workspaceId)))
        .limit(1)
      if (!sheet) return null

      return tx
        .select()
        .from(columns)
        .where(eq(columns.sheetId, sheetId))
        .orderBy(asc(columns.position))
    })

    if (!cols) {
      return reply.code(404).send({ error: { code: 'SHEET_NOT_FOUND', message: `Sheet ${sheetId} not found`, requestId: request.id } })
    }

    return { data: cols, requestId: request.id }
  })

  // POST /sheets/:sheetId/columns
  app.post('/:sheetId/columns', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'EDITOR')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'EDITOR role required', requestId: request.id } })
    }

    const { sheetId } = request.params as { sheetId: string }
    const body = CreateColumnBody.parse(request.body)

    const [col] = await withRls(app.db, request, async (tx) => {
      const [sheet] = await tx.select({ id: sheets.id }).from(sheets)
        .where(and(eq(sheets.id, sheetId), eq(sheets.workspaceId, request.ctx.workspaceId)))
        .limit(1)
      if (!sheet) return []

      // Calculate next position if not provided
      let position = body.position
      if (position === undefined) {
        const existing = await tx
          .select({ pos: columns.position })
          .from(columns)
          .where(eq(columns.sheetId, sheetId))
          .orderBy(asc(columns.position))
        position = existing.length
      }

      return tx.insert(columns).values({
        id: uuid(),
        sheetId,
        name: body.name,
        type: body.type,
        position,
        width: body.width ?? 150,
        format: body.format ?? {},
        validation: body.validation ?? null,
      }).returning()
    })

    if (!col) {
      return reply.code(404).send({ error: { code: 'SHEET_NOT_FOUND', message: `Sheet ${sheetId} not found`, requestId: request.id } })
    }

    reply.code(201)
    return { data: col, requestId: request.id }
  })

  // PUT /sheets/:sheetId/columns/:colId
  app.put('/:sheetId/columns/:colId', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'EDITOR')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'EDITOR role required', requestId: request.id } })
    }

    const { sheetId, colId } = request.params as { sheetId: string; colId: string }
    const body = UpdateColumnBody.parse(request.body)

    const [updated] = await withRls(app.db, request, async (tx) =>
      tx.update(columns)
        .set({
          ...(body.name !== undefined && { name: body.name }),
          ...(body.type !== undefined && { type: body.type }),
          ...(body.position !== undefined && { position: body.position }),
          ...(body.width !== undefined && { width: body.width }),
          ...(body.format !== undefined && { format: body.format }),
          ...(body.validation !== undefined && { validation: body.validation }),
        })
        .where(and(eq(columns.id, colId), eq(columns.sheetId, sheetId)))
        .returning(),
    )

    if (!updated) {
      return reply.code(404).send({ error: { code: 'COLUMN_NOT_FOUND', message: `Column ${colId} not found`, requestId: request.id } })
    }

    return { data: updated, requestId: request.id }
  })

  // DELETE /sheets/:sheetId/columns/:colId
  app.delete('/:sheetId/columns/:colId', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'EDITOR')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'EDITOR role required', requestId: request.id } })
    }

    const { sheetId, colId } = request.params as { sheetId: string; colId: string }

    await withRls(app.db, request, async (tx) =>
      tx.delete(columns)
        .where(and(eq(columns.id, colId), eq(columns.sheetId, sheetId))),
    )

    reply.code(204)
  })
}
