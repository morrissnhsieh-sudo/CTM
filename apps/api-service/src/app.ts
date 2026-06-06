import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { dbPlugin } from './plugins/db.js'
import { redisPlugin } from './plugins/redis.js'
import { kafkaPlugin } from './plugins/kafka.js'
import { authPlugin } from './plugins/auth.js'
import { rateLimitPlugin } from './plugins/rateLimit.js'
import { swaggerPlugin } from './plugins/swagger.js'
import { formulaPlugin } from './formula/plugin.js'

import { sheetsRouter } from './routes/sheets.js'
import { foldersRouter } from './routes/folders.js'
import { rowsRouter } from './routes/rows.js'
import { columnsRouter } from './routes/columns.js'
import { cellsRouter } from './routes/cells.js'
import { workspacesRouter } from './routes/workspaces.js'
import { usersRouter } from './routes/users.js'
import { authRouter } from './routes/auth.js'
import { aiRouter } from './routes/ai.js'
import { webhooksRouter } from './routes/webhooks.js'
import { pmRouter } from './routes/pm.js'
import { searchRouter } from './routes/search.js'
import { copyRouter } from './routes/copy.js'
import { exportRouter } from './routes/export.js'
import { importRouter } from './routes/import.js'
import { discussionsRouter } from './routes/discussions.js'
import { attachmentsRouter } from './routes/attachments.js'
import { mcpRouter } from './mcp/router.js'

import cors from '@fastify/cors'
import helmet from '@fastify/helmet'

export async function buildApp(app: FastifyInstance) {
  // ─── Security ────────────────────────────────────────────
  await app.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  })
  await app.register(helmet, { contentSecurityPolicy: false })

  // ─── Infrastructure plugins ──────────────────────────────
  await app.register(fp(dbPlugin))
  await app.register(fp(redisPlugin))
  await app.register(fp(kafkaPlugin))

  // ─── Auth + Rate Limiting ────────────────────────────────
  await app.register(fp(authPlugin))
  await app.register(fp(rateLimitPlugin))

  // ─── Formula Engine (M4, in-process) ────────────────────
  await app.register(fp(formulaPlugin))

  // ─── OpenAPI docs ────────────────────────────────────────
  await app.register(swaggerPlugin)

  // ─── API Routes (v1) ─────────────────────────────────────
  await app.register(
    async (v1) => {
      v1.register(workspacesRouter,  { prefix: '/workspaces' })
      v1.register(foldersRouter,     { prefix: '/folders' })
      v1.register(sheetsRouter,      { prefix: '/sheets' })
      v1.register(attachmentsRouter, { prefix: '/attachments' })
      v1.register(copyRouter,        { prefix: '/sheets' })       // POST /sheets/:id/copy
      v1.register(discussionsRouter, { prefix: '/sheets' })       // GET/POST /sheets/:id/discussions
      v1.register(rowsRouter,        { prefix: '/sheets' })
      v1.register(columnsRouter,     { prefix: '/sheets' })
      v1.register(cellsRouter,       { prefix: '/sheets' })
      v1.register(usersRouter,       { prefix: '/users' })
      v1.register(authRouter,        { prefix: '/auth' })
      v1.register(aiRouter,          { prefix: '/ai' })
      v1.register(webhooksRouter,    { prefix: '/webhooks' })
      v1.register(pmRouter,          { prefix: '/projects' })
      v1.register(searchRouter,      { prefix: '/search' })
      v1.register(exportRouter,      { prefix: '/export' })       // POST /export/:sheetId
      v1.register(importRouter,      { prefix: '/import' })       // POST /import
    },
    { prefix: '/v1' },
  )

  // ─── MCP Server ──────────────────────────────────────────
  await app.register(mcpRouter, { prefix: '/mcp' })

  // ─── Health check ────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', service: 'api-service', ts: new Date().toISOString() }))

  // ─── Global error handler ────────────────────────────────
  app.setErrorHandler((error: any, request, reply) => {
    const requestId = request.id as string

    // Zod validation errors → 400
    if (error?.name === 'ZodError' && Array.isArray(error.issues)) {
      const first = error.issues[0]
      const field = first?.path?.join('.') ?? 'unknown'
      const msg   = first?.message ?? 'Invalid request body'
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: `${field}: ${msg}`, requestId },
      })
    }

    app.log.error({ err: error, requestId }, 'Unhandled error')

    const statusCode = (error && typeof error === 'object' && error.statusCode) ? error.statusCode : 500
    const code = (error && typeof error === 'object' && error.code) ? error.code : 'INTERNAL_ERROR'
    const message = statusCode >= 500 ? 'Internal server error' : (error && typeof error === 'object' && error.message) ? error.message : 'Unknown error'

    reply.code(statusCode).send({
      error: {
        code,
        message,
        requestId,
      },
    })
  })

  return app
}
