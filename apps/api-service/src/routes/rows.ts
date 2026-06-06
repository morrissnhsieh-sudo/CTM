import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and, isNull, asc, gt, inArray, sql } from 'drizzle-orm'
import { rows, cells, sheets, columns } from '../db/schema.js'
import { withRls, paginated, cursorPaginated, decodeCursor, selectFields } from '../db/helpers.js'
import { hasMinRole } from '@ctm/shared-types'
import { v4 as uuid } from 'uuid'

const InsertRowsBody = z.object({
  rows: z.array(z.object({
    position: z.number().int().nonnegative().optional(),
    parentId: z.string().uuid().nullable().optional(),
    expanded: z.boolean().optional(),
    cells: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  })).min(1).max(500),
})

const UpdateRowBody = z.object({
  cells: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  parentId: z.string().uuid().nullable().optional(),
  expanded: z.boolean().optional(),
  position: z.number().int().nonnegative().optional(),
})

export const rowsRouter: FastifyPluginAsync = async (app) => {
  // GET /sheets/:sheetId/rows
  // Supports:
  //   offset pagination: ?page=1&pageSize=100  (default)
  //   cursor pagination: ?cursor=<base64>&pageSize=500  (for large exports, stable)
  //   field selection:   ?fields=id,position,cells
  app.get('/:sheetId/rows', async (request, reply) => {
    const { sheetId } = request.params as { sheetId: string }
    const {
      page     = 1,
      pageSize = 100,
      cursor,
      fields,
    } = request.query as { page?: number; pageSize?: number; cursor?: string; fields?: string }

    const limit = Math.min(pageSize, 1000)

    const result = await withRls(app.db, request, async (tx) => {
      // Verify sheet belongs to workspace
      const [sheet] = await tx.select({ id: sheets.id }).from(sheets)
        .where(and(eq(sheets.id, sheetId), eq(sheets.workspaceId, request.ctx.workspaceId)))
        .limit(1)

      if (!sheet) return null

      // ── Cursor-based pagination ─────────────────────────────────────────────
      if (cursor) {
        const decoded = decodeCursor(cursor)
        if (!decoded) {
          return 'invalid_cursor' as const
        }

        const rowList = await tx
          .select()
          .from(rows)
          .where(and(
            eq(rows.sheetId, sheetId),
            isNull(rows.deletedAt),
            // Rows after the cursor (position > lastPosition, or same position but id > lastId)
            gt(rows.position, decoded.lastPosition),
          ))
          .orderBy(asc(rows.position))
          .limit(limit)

        if (!rowList.length) return { mode: 'cursor' as const, rows: [], cells: [] }

        const rowIds = rowList.map((r) => r.id)
        const cellList = await tx.select().from(cells).where(inArray(cells.rowId, rowIds))
        return { mode: 'cursor' as const, rows: rowList, cells: cellList }
      }

      // ── Offset-based pagination ─────────────────────────────────────────────
      const offset = (page - 1) * limit

      const rowList = await tx
        .select()
        .from(rows)
        .where(and(eq(rows.sheetId, sheetId), isNull(rows.deletedAt)))
        .orderBy(asc(rows.position))
        .limit(limit)
        .offset(offset)

      if (!rowList.length) return { mode: 'offset' as const, rows: [], cells: [] }

      const rowIds = rowList.map((r) => r.id)
      const cellList = await tx.select().from(cells).where(inArray(cells.rowId, rowIds))
      return { mode: 'offset' as const, rows: rowList, cells: cellList }
    })

    if (!result) {
      return reply.code(404).send({
        error: { code: 'SHEET_NOT_FOUND', message: `Sheet ${sheetId} not found`, requestId: request.id },
      })
    }
    if (result === 'invalid_cursor') {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid or expired cursor', requestId: request.id },
      })
    }

    // Group cells by rowId
    const cellsByRow: Record<string, typeof result.cells> = {}
    for (const cell of result.cells) {
      ;(cellsByRow[cell.rowId] ??= []).push(cell)
    }

    const data = result.rows.map((r) => ({ ...r, cells: cellsByRow[r.id] ?? [] }))
    const withFields = selectFields(data, fields)

    // Return appropriate pagination format
    if (result.mode === 'cursor') {
      return cursorPaginated(
        result.rows.map((r) => ({ ...r, cells: cellsByRow[r.id] ?? [] })),
        limit,
        request.id as string,
      )
    }

    return paginated(withFields, withFields.length, page, limit, request.id as string)
  })

  // POST /sheets/:sheetId/rows — bulk insert
  app.post('/:sheetId/rows', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'EDITOR')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'EDITOR role required', requestId: request.id } })
    }

    const { sheetId } = request.params as { sheetId: string }
    const body = InsertRowsBody.parse(request.body)

    const result = await withRls(app.db, request, async (tx) => {
      const [sheet] = await tx.select({ id: sheets.id }).from(sheets)
        .where(and(eq(sheets.id, sheetId), eq(sheets.workspaceId, request.ctx.workspaceId)))
        .limit(1)
      if (!sheet) return null

      // Get max current position
      const [maxPos] = await tx
        .select({ maxPos: sql<number>`COALESCE(MAX(position), -1)` })
        .from(rows)
        .where(and(eq(rows.sheetId, sheetId), isNull(rows.deletedAt)))

      const startPos = (maxPos?.maxPos ?? -1) + 1

      const insertedRows = await tx
        .insert(rows)
        .values(
          body.rows.map((r, i) => ({
            id: uuid(),
            sheetId,
            parentId: r.parentId ?? null,
            expanded: r.expanded ?? true,
            position: r.position ?? startPos + i,
            createdBy: request.ctx.userId,
          })),
        )
        .returning()

      // Insert cells if provided
      const cellInserts: typeof cells.$inferInsert[] = []
      for (let i = 0; i < body.rows.length; i++) {
        const rowDef = body.rows[i]
        const row = insertedRows[i]
        if (!row || !rowDef?.cells) continue
        for (const [colId, value] of Object.entries(rowDef.cells)) {
          cellInserts.push({
            rowId: row.id,
            colId,
            ...(value != null && { value: String(value) }),
            updatedBy: request.ctx.userId,
          })
        }
      }

      if (cellInserts.length) {
        await tx.insert(cells).values(cellInserts)
      }

      // Publish row.created events via Kafka
      for (const row of insertedRows) {
        await app.publishEvent('ctm.rows', {
          eventId: uuid(),
          type: 'row.created',
          timestamp: Date.now(),
          workspaceId: request.ctx.workspaceId,
          userId: request.ctx.userId,
          sheetId,
          rowId: row.id,
          position: row.position,
        })
      }

      return insertedRows
    })

    if (!result) {
      return reply.code(404).send({ error: { code: 'SHEET_NOT_FOUND', message: `Sheet ${sheetId} not found`, requestId: request.id } })
    }

    reply.code(201)
    return { data: result, requestId: request.id }
  })

  // PUT /sheets/:sheetId/rows/:rowId
  app.put('/:sheetId/rows/:rowId', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'EDITOR')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'EDITOR role required', requestId: request.id } })
    }

    const { sheetId, rowId } = request.params as { sheetId: string; rowId: string }
    const body = UpdateRowBody.parse(request.body)

    const changedCols: string[] = []

    await withRls(app.db, request, async (tx) => {
      if (body.cells) {
        for (const [colId, rawValue] of Object.entries(body.cells)) {
          const value = rawValue == null ? null : String(rawValue)
          const isFormula = typeof rawValue === 'string' && rawValue.startsWith('=')

          await tx
            .insert(cells)
            .values({
              rowId,
              colId,
              ...(isFormula ? { formula: value } : (value != null ? { value } : {})),
              updatedBy: request.ctx.userId,
            })
            .onConflictDoUpdate({
              target: [cells.rowId, cells.colId],
              set: {
                value: isFormula ? null : value,
                formula: isFormula ? value : null,
                updatedBy: request.ctx.userId,
                updatedAt: new Date(),
              } as any,
            })

          changedCols.push(colId)

          // Trigger formula engine if this is a formula or affects other formulas
          if (isFormula && value) {
            await app.formulaEngine.setCellContents(sheetId, rowId, colId, value)
          }
        }
      }

      const updateData: any = { updatedAt: new Date() }
      if (body.parentId !== undefined) updateData.parentId = body.parentId
      if (body.expanded !== undefined) updateData.expanded = body.expanded
      if (body.position !== undefined) updateData.position = body.position

      await tx
        .update(rows)
        .set(updateData)
        .where(eq(rows.id, rowId))

      // Publish row.updated event
      await app.publishEvent('ctm.rows', {
        eventId: uuid(),
        type: 'row.updated',
        timestamp: Date.now(),
        workspaceId: request.ctx.workspaceId,
        userId: request.ctx.userId,
        sheetId,
        rowId,
        changedCols,
      })
    })

    return { data: { rowId, updated: true }, requestId: request.id }
  })

  // DELETE /sheets/:sheetId/rows/:rowId
  app.delete('/:sheetId/rows/:rowId', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'EDITOR')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'EDITOR role required', requestId: request.id } })
    }

    const { sheetId, rowId } = request.params as { sheetId: string; rowId: string }

    await withRls(app.db, request, async (tx) =>
      tx
        .update(rows)
        // @ts-ignore -- Drizzle v0.41: PgUpdateSetSource excludes defaulted/nullable columns
        .set({ deletedAt: new Date() })
        .where(and(eq(rows.id, rowId), eq(rows.sheetId, sheetId))),
    )

    await app.publishEvent('ctm.rows', {
      eventId: uuid(),
      type: 'row.deleted',
      timestamp: Date.now(),
      workspaceId: request.ctx.workspaceId,
      userId: request.ctx.userId,
      sheetId,
      rowId,
    })

    reply.code(204)
  })
}

// Extend FastifyInstance with formulaEngine
declare module 'fastify' {
  interface FastifyInstance {
    formulaEngine: import('../formula/engine.js').FormulaEngine
  }
}
