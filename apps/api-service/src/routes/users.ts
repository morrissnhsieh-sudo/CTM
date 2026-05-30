import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { users, apiTokens } from '../db/schema.js'
import { withRls } from '../db/helpers.js'
import { hasMinRole } from '@ctm/shared-types'
import crypto from 'node:crypto'
import { v4 as uuid } from 'uuid'

export const usersRouter: FastifyPluginAsync = async (app) => {
  // GET /users
  app.get('/', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'ADMIN')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'ADMIN role required', requestId: request.id } })
    }

    const result = await withRls(app.db, request, async (tx) =>
      tx.select().from(users).where(eq(users.workspaceId, request.ctx.workspaceId)),
    )

    return { data: result, requestId: request.id }
  })

  // GET /users/me
  app.get('/me', async (request) => {
    const [user] = await withRls(app.db, request, async (tx) =>
      tx.select().from(users)
        .where(and(eq(users.id, request.ctx.userId), eq(users.workspaceId, request.ctx.workspaceId)))
        .limit(1),
    )
    return { data: user ?? null, requestId: request.id }
  })

  // POST /users/tokens — create PAT
  app.post('/tokens', async (request, reply) => {
    const body = z.object({ name: z.string().min(1).max(100) }).parse(request.body)

    const rawToken = `ctm_pat_${crypto.randomBytes(32).toString('hex')}`
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    await withRls(app.db, request, async (tx) =>
      tx.insert(apiTokens).values({
        id: uuid(),
        userId: request.ctx.userId,
        workspaceId: request.ctx.workspaceId,
        name: body.name,
        tokenHash,
        role: request.ctx.role,
      }),
    )

    reply.code(201)
    // Raw token returned ONCE — never stored in plaintext
    return { data: { token: rawToken, name: body.name }, requestId: request.id }
  })

  // DELETE /users/tokens/:id
  app.delete('/tokens/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    await withRls(app.db, request, async (tx) =>
      tx.delete(apiTokens)
        .where(and(
          eq(apiTokens.id, id),
          eq(apiTokens.userId, request.ctx.userId),
        )),
    )

    reply.code(204)
  })
}
