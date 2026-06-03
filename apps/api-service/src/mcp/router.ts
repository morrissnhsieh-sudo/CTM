import type { FastifyPluginAsync } from 'fastify'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import crypto from 'node:crypto'
import { eq, and, isNull, asc, sql } from 'drizzle-orm'
import { sheets, columns, rows, cells } from '../db/schema.js'
import { withRls } from '../db/helpers.js'

/**
 * MCP (Model Context Protocol) Server — M3.4
 * Exposes CTM spreadsheet operations as tools for AI clients
 * (Claude, Cursor, Codex, etc.)
 */
export const mcpRouter: FastifyPluginAsync = async (app) => {
  // MCP callback endpoint for tool authorization
  app.get('/auth/callback', async (request, reply) => {
    reply.send({ status: 'MCP OAuth callback — local JWT auth only' })
  })

  // MCP HTTP/SSE transport endpoint
  app.post('/message', async (request, reply) => {
    // Each request creates a server instance bound to the authenticated user
    const ctx = request.ctx
    if (!ctx) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    const server = new McpServer({
      name: 'CTM Platform',
      version: '1.0.0',
    })

    type ToolResult = { content: Array<{ type: 'text'; text: string }> }

    // ── Tool: read_sheet ──────────────────────────────────────
    // @ts-ignore -- Drizzle v0.41 TS2589: MCP SDK type inference too deep
    server.tool(
      'read_sheet',
      'Read the schema and metadata of a CTM sheet',
      { sheetId: z.string().describe('UUID of the sheet') },
      async ({ sheetId }): Promise<ToolResult> => {
        const result = await withRls(app.db, request, async (tx) => {
          const [sheet] = await tx.select().from(sheets)
            .where(and(eq(sheets.id, sheetId), eq(sheets.workspaceId, ctx.workspaceId)))
            .limit(1)

          if (!sheet) return null

          const cols = await tx.select().from(columns)
            .where(eq(columns.sheetId, sheetId))
            .orderBy(asc(columns.position))

          return { sheet, columns: cols }
        })

        if (!result) return { content: [{ type: 'text' as const, text: `Sheet ${sheetId} not found` }] }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          }],
        }
      },
    )

    // ── Tool: read_rows ───────────────────────────────────────
    // @ts-ignore -- Drizzle v0.41 TS2589: MCP SDK type inference too deep
    server.tool(
      'read_rows',
      'Read rows from a CTM sheet with pagination',
      {
        sheetId: z.string().describe('UUID of the sheet'),
        limit: z.number().int().min(1).max(500).default(100).describe('Max rows to return'),
        offset: z.number().int().min(0).default(0).describe('Row offset'),
      },
      async ({ sheetId, limit, offset }): Promise<ToolResult> => {
        const rowData = await withRls(app.db, request, async (tx) => {
          const rowList = await tx.select().from(rows)
            .where(and(eq(rows.sheetId, sheetId), isNull(rows.deletedAt)))
            .orderBy(asc(rows.position))
            .limit(limit)
            .offset(offset)

          if (!rowList.length) return []

          const rowIds = rowList.map(r => r.id)
          const cellData = await tx.select().from(cells)
            .where(sql`${cells.rowId} = ANY(${rowIds})`)

          const cellsByRow: Record<string, typeof cellData> = {}
          for (const c of cellData) {
            ;(cellsByRow[c.rowId] ??= []).push(c)
          }

          return rowList.map(r => ({ ...r, cells: cellsByRow[r.id] ?? [] }))
        })

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(rowData, null, 2),
          }],
        }
      },
    )

    // ── Tool: update_cell ─────────────────────────────────────
    // @ts-ignore -- Drizzle v0.41 TS2589: MCP SDK type inference too deep
    server.tool(
      'update_cell',
      'Update a single cell value in a CTM sheet',
      {
        sheetId: z.string().describe('UUID of the sheet'),
        rowId: z.string().describe('UUID of the row'),
        colId: z.string().describe('UUID of the column'),
        value: z.string().describe('New cell value (formula starts with =)'),
      },
      async ({ sheetId, rowId, colId, value }): Promise<ToolResult> => {
        if (ctx.role === 'VIEWER' || ctx.role === 'COMMENTER') {
          return { content: [{ type: 'text' as const, text: 'Error: EDITOR role required to update cells' }] }
        }

        await withRls(app.db, request, async (tx) => {
          const isFormula = value.startsWith('=')
          await tx.insert(cells).values({
            rowId, colId,
            ...(isFormula ? { formula: value } : { value }),
            updatedBy: ctx.userId,
          }).onConflictDoUpdate({
            target: [cells.rowId, cells.colId],
            set: {
              value: isFormula ? sql`NULL` : value,
              formula: isFormula ? value : sql`NULL`,
              updatedBy: ctx.userId,
              updatedAt: new Date(),
            } as any,
          })
        })

        return { content: [{ type: 'text' as const, text: `Cell updated successfully` }] }
      },
    )

    // ── Tool: insert_row ──────────────────────────────────────
    // @ts-ignore -- Drizzle v0.41 TS2589: MCP SDK type inference too deep
    server.tool(
      'insert_row',
      'Insert a new row into a CTM sheet',
      {
        sheetId: z.string().describe('UUID of the sheet'),
        cells: z.record(z.string()).describe('Map of colId → value'),
      },
      async ({ sheetId, cells: cellValues }): Promise<ToolResult> => {
        if (ctx.role === 'VIEWER' || ctx.role === 'COMMENTER') {
          return { content: [{ type: 'text' as const, text: 'Error: EDITOR role required' }] }
        }

        const rowId = crypto.randomUUID()

        await withRls(app.db, request, async (tx) => {
          const [maxPos] = await tx
            .select({ maxPos: sql<number>`COALESCE(MAX(position), -1)` })
            .from(rows)
            .where(and(eq(rows.sheetId, sheetId), isNull(rows.deletedAt)))

          await tx.insert(rows).values({
            id: rowId,
            sheetId,
            position: (maxPos?.maxPos ?? -1) + 1,
            createdBy: ctx.userId,
          })

          const cellInserts = Object.entries(cellValues).map(([colId, value]) => ({
            rowId,
            colId,
            value,
            updatedBy: ctx.userId,
            updatedAt: new Date(),
          }))

          if (cellInserts.length) {
            await tx.insert(cells).values(cellInserts)
          }
        })

        return { content: [{ type: 'text' as const, text: `Row ${rowId} inserted` }] }
      },
    )

    // ── Tool: query_data_nl ───────────────────────────────────
    // @ts-ignore -- Drizzle v0.41 TS2589: MCP SDK type inference too deep
    server.tool(
      'query_data_nl',
      'Query spreadsheet data using natural language (Text-to-SQL via AI)',
      {
        sheetId: z.string().describe('UUID of the sheet to query'),
        question: z.string().describe('Natural language question about the data'),
      },
      async ({ sheetId, question }): Promise<ToolResult> => {
        // Proxy to M6 AI service
        const response = await fetch(`${process.env['AI_SERVICE_URL']}/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Workspace-Id': ctx.workspaceId,
            'X-User-Id': ctx.userId,
            'X-User-Role': ctx.role,
          },
          body: JSON.stringify({ sheetId, prompt: question, mode: 'ask' }),
        })

        const data = await response.json() as { explanation?: string; rows?: unknown[] }

        return {
          content: [{
            type: 'text' as const,
            text: `${data.explanation ?? ''}\n\nResults (${data.rows?.length ?? 0} rows):\n${JSON.stringify(data.rows ?? [], null, 2)}`,
          }],
        }
      },
    )

    // Return the tool list as JSON for HTTP transport
    return reply.send({
      tools: [
        'read_sheet',
        'read_rows',
        'update_cell',
        'insert_row',
        'query_data_nl',
      ],
    })
  })

  // GET /mcp — MCP server info
  app.get('/', async () => ({
    name: 'CTM Platform MCP Server',
    version: '1.0.0',
    transport: 'http-sse',
    tools: ['read_sheet', 'read_rows', 'filter_rows', 'update_cell', 'insert_row',
      'delete_row', 'create_sheet', 'run_formula', 'get_column_schema',
      'trigger_workflow', 'query_data_nl'],
  }))
}
