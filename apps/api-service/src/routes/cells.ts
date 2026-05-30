import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { cells } from '../db/schema.js'
import { withRls } from '../db/helpers.js'
import { hasMinRole } from '@ctm/shared-types'
import { v4 as uuid } from 'uuid'

const UpdateCellBody = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  format: z.record(z.unknown()).optional(),
})

export const cellsRouter: FastifyPluginAsync = async (app) => {
  // GET /sheets/:sheetId/rows/:rowId/cells
  app.get('/:sheetId/rows/:rowId/cells', async (request, reply) => {
    const { rowId } = request.params as { sheetId: string; rowId: string }

    const result = await withRls(app.db, request, async (tx) =>
      tx.select().from(cells).where(eq(cells.rowId, rowId)),
    )

    return { data: result, requestId: request.id }
  })

  // PUT /sheets/:sheetId/rows/:rowId/cells/:colId
  app.put('/:sheetId/rows/:rowId/cells/:colId', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'EDITOR')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'EDITOR role required', requestId: request.id } })
    }

    const { sheetId, rowId, colId } = request.params as {
      sheetId: string; rowId: string; colId: string
    }
    const body = UpdateCellBody.parse(request.body)

    const rawValue = body.value
    const strValue = rawValue == null ? null : String(rawValue)
    const isFormula = typeof rawValue === 'string' && rawValue.startsWith('=')

    let formulaDiff: Awaited<ReturnType<typeof app.formulaEngine.setCellContents>> | undefined

    if (isFormula && strValue) {
      formulaDiff = await app.formulaEngine.setCellContents(sheetId, rowId, colId, strValue)
    }

    const [updated] = await withRls(app.db, request, async (tx) =>
      tx.insert(cells)
        .values({
          rowId,
          colId,
          value: isFormula ? (formulaDiff?.[0]?.newValue != null ? String(formulaDiff[0].newValue) : null) : strValue,
          formula: isFormula ? strValue : null,
          format: body.format ?? {},
          updatedBy: request.ctx.userId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [cells.rowId, cells.colId],
          set: {
            value: isFormula ? (formulaDiff?.[0]?.newValue != null ? String(formulaDiff[0].newValue) : null) : strValue,
            formula: isFormula ? strValue : null,
            ...(body.format !== undefined && { format: body.format }),
            updatedBy: request.ctx.userId,
            updatedAt: new Date(),
          },
        })
        .returning(),
    )

    // Publish cell.updated event
    await app.publishEvent('ctm.cells', {
      eventId: uuid(),
      type: 'cell.updated',
      timestamp: Date.now(),
      workspaceId: request.ctx.workspaceId,
      userId: request.ctx.userId,
      sheetId,
      rowId,
      colId,
      cellRef: `r${rowId}c${colId}`,
      oldValue: null,
      newValue: body.value,
      formula: isFormula ? strValue : null,
    })

    return {
      data: updated,
      formulaDiff: formulaDiff ?? null,
      requestId: request.id,
    }
  })
}
