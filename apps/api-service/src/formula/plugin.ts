import fp from 'fastify-plugin'
import { FormulaEngine } from './engine.js'
import { eq, and } from 'drizzle-orm'
import { cells, rows, columns } from '../db/schema.js'
import { sql } from 'drizzle-orm'

declare module 'fastify' {
  interface FastifyInstance {
    formulaEngine: FormulaEngine
  }
}

export const formulaPlugin = fp(async (app) => {
  const engine = new FormulaEngine({
    async onAiFormulaRequested(req) {
      // Publish to Kafka ctm.ai.jobs for M6 to process asynchronously
      await app.publishEvent('ctm.ai.jobs', {
        eventId: crypto.randomUUID(),
        type: 'ai.formula.job',
        timestamp: Date.now(),
        workspaceId: req.workspaceId,
        userId: req.userId,
        sheetId: req.sheetId,
        cellRef: req.cellRef,
        formula: req.formula,
        contextRange: req.contextRange,
      })
    },

    async getSheetCells(sheetId: string) {
      // Build a row→index and col→index map from the DB
      const result = await app.db.execute(sql`
        SELECT
          r.id AS row_id,
          c.id AS col_id,
          c.value,
          c.formula,
          r.position AS row_pos,
          col.position AS col_pos
        FROM cells c
        JOIN rows r ON r.id = c.row_id AND r.deleted_at IS NULL
        JOIN columns col ON col.id = c.col_id
        WHERE r.sheet_id = ${sheetId}
        ORDER BY r.position ASC, col.position ASC
      `)

      return (result.rows as Array<{
        row_id: string
        col_id: string
        value: string | null
        formula: string | null
        row_pos: number
        col_pos: number
      }>).map(row => ({
        rowIdx: row.row_pos,
        colIdx: row.col_pos,
        value: row.value,
        formula: row.formula,
      }))
    },
  })

  app.decorate('formulaEngine', engine)

  app.addHook('onClose', async () => {
    engine.destroy()
  })
})
