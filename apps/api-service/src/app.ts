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
import { rowsRouter } from './routes/rows.js'
import { columnsRouter } from './routes/columns.js'
import { cellsRouter } from './routes/cells.js'
import { workspacesRouter } from './routes/workspaces.js'
import { usersRouter } from './routes/users.js'
import { aiRouter } from './routes/ai.js'
import { webhooksRouter } from './routes/webhooks.js'
import { pmRouter } from './routes/pm.js'
import { searchRouter } from './routes/search.js'
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
      v1.register(workspacesRouter, { prefix: '/workspaces' })
      v1.register(sheetsRouter,     { prefix: '/sheets' })
      v1.register(rowsRouter,       { prefix: '/sheets' })
      v1.register(columnsRouter,    { prefix: '/sheets' })
      v1.register(cellsRouter,      { prefix: '/sheets' })
      v1.register(usersRouter,      { prefix: '/users' })
      v1.register(aiRouter,         { prefix: '/ai' })
      v1.register(webhooksRouter,   { prefix: '/webhooks' })
      v1.register(pmRouter,         { prefix: '/projects' })
      v1.register(searchRouter,     { prefix: '/search' })
    },
    { prefix: '/v1' },
  )

  // ─── MCP Server ──────────────────────────────────────────
  await app.register(mcpRouter, { prefix: '/mcp' })

  // ─── Health check ────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', service: 'api-service', ts: new Date().toISOString() }))

  // ─── Global error handler ────────────────────────────────
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id as string
    app.log.error({ err: error, requestId }, 'Unhandled error')

    const statusCode = error.statusCode ?? 500
    reply.code(statusCode).send({
      error: {
        code: error.code ?? 'INTERNAL_ERROR',
        message: statusCode >= 500 ? 'Internal server error' : error.message,
        requestId,
      },
    })
  })

  return app
}
