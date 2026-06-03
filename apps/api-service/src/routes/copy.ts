/**
 * POST /sheets/:id/copy
 *
 * Smartsheet-compatible sheet copy.
 * Deep-clones the sheet: columns, rows, and all cell values are duplicated.
 * Formulas are preserved. Attachments are NOT copied (S3 files stay on original).
 *
 * Spec:
 *  - Min role: EDITOR
 *  - Returns the new sheet object (202 Accepted — copy may be async for large sheets)
 *  - Body: { title?: string, workspaceId?: string, includeData?: boolean }
 *    - title defaults to "Copy of {original title}"
 *    - workspaceId defaults to same workspace (cross-workspace copy for ADMIN+)
 *    - includeData defaults to true; false copies columns only
 */

import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and, isNull, asc, inArray } from 'drizzle-orm'
import { sheets, columns, rows, cells } from '../db/schema.js'
import { withRls } from '../db/helpers.js'
import { hasMinRole } from '@ctm/shared-types'
import { v4 as uuid } from 'uuid'

const CopySheetBody = z.object({
  title:       z.string().min(1).max(255).optional(),
  workspaceId: z.string().uuid().optional(),   // cross-workspace — ADMIN only
  includeData: z.boolean().default(true),      // false = columns only, no rows
})

export const copyRouter: FastifyPluginAsync = async (app) => {
  // POST /sheets/:id/copy
  app.post('/:id/copy', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'EDITOR')) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'EDITOR role required to copy sheets', requestId: request.id },
      })
    }

    const { id } = request.params as { id: string }
    const body = CopySheetBody.parse(request.body ?? {})

    // Validate cross-workspace copy requires ADMIN
    const targetWorkspaceId = body.workspaceId ?? request.ctx.workspaceId
    if (targetWorkspaceId !== request.ctx.workspaceId && !hasMinRole(request.ctx.role, 'ADMIN')) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'ADMIN role required for cross-workspace copy', requestId: request.id },
      })
    }

    const result = await withRls(app.db, request, async (tx) => {
      // ── 1. Load source sheet ───────────────────────────────────────────────
      const [source] = await tx.select().from(sheets)
        .where(and(eq(sheets.id, id), eq(sheets.workspaceId, request.ctx.workspaceId)))
        .limit(1)
      if (!source) return null

      // ── 2. Load source columns ─────────────────────────────────────────────
      const sourceCols = await tx.select().from(columns)
        .where(eq(columns.sheetId, id))
        .orderBy(asc(columns.position))

      // ── 3. Create new sheet ────────────────────────────────────────────────
      const newSheetId = uuid()
      // @ts-ignore -- Drizzle v0.41: .default() columns excluded from insert type
      const [newSheet] = await tx.insert(sheets).values({
        id:          newSheetId,
        workspaceId: targetWorkspaceId,
        title:       body.title ?? `Copy of ${source.title}`,
        description: source.description,
        projectId:   source.projectId,
        createdBy:   request.ctx.userId,
        settings:    source.settings as Record<string, unknown>,
      }).returning()

      // ── 4. Copy columns, building colId mapping ────────────────────────────
      const colIdMap = new Map<string, string>()   // old colId → new colId

      if (sourceCols.length > 0) {
        const newCols = sourceCols.map((col) => {
          const newId = uuid()
          colIdMap.set(col.id, newId)
          return {
            id:         newId,
            sheetId:    newSheetId,
            name:       col.name,
            type:       col.type,
            position:   col.position,
            width:      col.width,
            frozen:     col.frozen,
            hidden:     col.hidden,
            format:     col.format as Record<string, unknown>,
            validation: col.validation as Record<string, unknown> | null,
          }
        })
        await tx.insert(columns).values(newCols)
      }

      if (!body.includeData) {
        return { sheet: newSheet, colsCopied: sourceCols.length, rowsCopied: 0 }
      }

      // ── 5. Copy rows in batches of 500 ────────────────────────────────────
      const sourceRows = await tx.select().from(rows)
        .where(and(eq(rows.sheetId, id), isNull(rows.deletedAt)))
        .orderBy(asc(rows.position))

      if (sourceRows.length === 0) {
        return { sheet: newSheet, colsCopied: sourceCols.length, rowsCopied: 0 }
      }

      const rowIdMap = new Map<string, string>()   // old rowId → new rowId
      const BATCH = 500

      for (let i = 0; i < sourceRows.length; i += BATCH) {
        const batch = sourceRows.slice(i, i + BATCH)
        const newRows = batch.map((r) => {
          const newId = uuid()
          rowIdMap.set(r.id, newId)
          return { id: newId, sheetId: newSheetId, position: r.position, createdBy: request.ctx.userId }
        })
        await tx.insert(rows).values(newRows)
      }

      // ── 6. Copy cells in batches ───────────────────────────────────────────
      const sourceRowIds = sourceRows.map((r) => r.id)
      let totalCells = 0

      for (let i = 0; i < sourceRowIds.length; i += BATCH) {
        const batchRowIds = sourceRowIds.slice(i, i + BATCH)
        const batchCells = await tx.select().from(cells)
          .where(inArray(cells.rowId, batchRowIds))

        if (batchCells.length === 0) continue

        const newCells = batchCells.flatMap((c) => {
          const newRowId = rowIdMap.get(c.rowId)
          const newColId = colIdMap.get(c.colId)
          if (!newRowId || !newColId) return []
          return [{
            rowId:     newRowId,
            colId:     newColId,
            value:     c.value,
            formula:   c.formula,
            format:    c.format as Record<string, unknown>,
            updatedBy: request.ctx.userId,
          }]
        })

        if (newCells.length > 0) {
          await tx.insert(cells).values(newCells)
          totalCells += newCells.length
        }
      }

      return {
        sheet:      newSheet,
        colsCopied: sourceCols.length,
        rowsCopied: sourceRows.length,
        cellsCopied: totalCells,
      }
    })

    if (!result) {
      return reply.code(404).send({
        error: { code: 'SHEET_NOT_FOUND', message: `Sheet ${id} not found`, requestId: request.id },
      })
    }

    // Publish event for audit trail
    await app.publishEvent('ctm.rows', {
      eventId:     uuid(),
      type:        'row.created',  // reuse row.created for audit — sheet copy
      timestamp:   Date.now(),
      workspaceId: request.ctx.workspaceId,
      userId:      request.ctx.userId,
      sheetId:     result.sheet?.id ?? '',
      rowId:       '',
      position:    0,
    })

    reply.code(201)
    return { data: result, requestId: request.id }
  })
}
