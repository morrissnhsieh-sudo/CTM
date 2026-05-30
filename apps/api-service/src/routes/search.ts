import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { sql, eq, and } from 'drizzle-orm'
import { cells, rows, sheets, columns } from '../db/schema.js'
import { withRls } from '../db/helpers.js'

export const searchRouter: FastifyPluginAsync = async (app) => {
  // GET /search?q=...&scope=workspace|sheet&sheetId=...
  app.get('/', async (request, reply) => {
    const { q, scope = 'workspace', sheetId } = z.object({
      q: z.string().min(1).max(500),
      scope: z.enum(['workspace', 'sheet']).optional(),
      sheetId: z.string().uuid().optional(),
    }).parse(request.query)

    const results = await withRls(app.db, request, async (tx) => {
      // Full-text search on cell values using PostgreSQL tsvector
      const searchQuery = sql`to_tsquery('english', ${q.split(/\s+/).join(' & ')})`

      const sheetFilter = scope === 'sheet' && sheetId
        ? and(eq(sheets.workspaceId, request.ctx.workspaceId), eq(sheets.id, sheetId))
        : eq(sheets.workspaceId, request.ctx.workspaceId)

      return tx.execute(sql`
        SELECT
          c.row_id,
          c.col_id,
          c.value,
          r.sheet_id,
          s.title AS sheet_title,
          col.name AS column_name,
          ts_rank(to_tsvector('english', COALESCE(c.value, '')), ${searchQuery}) AS rank
        FROM cells c
        JOIN rows r ON r.id = c.row_id AND r.deleted_at IS NULL
        JOIN sheets s ON s.id = r.sheet_id
        JOIN columns col ON col.id = c.col_id
        WHERE
          ${sheetFilter}
          AND to_tsvector('english', COALESCE(c.value, '')) @@ ${searchQuery}
        ORDER BY rank DESC
        LIMIT 100
      `)
    })

    return { data: results.rows, requestId: request.id }
  })
}
