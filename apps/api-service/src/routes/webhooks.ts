import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { webhooks } from '../db/schema.js'
import { withRls } from '../db/helpers.js'
import { hasMinRole } from '@ctm/shared-types'
import crypto from 'node:crypto'
import { v4 as uuid } from 'uuid'

export const webhooksRouter: FastifyPluginAsync = async (app) => {
  // GET /webhooks
  app.get('/', async (request) => {
    const result = await withRls(app.db, request, async (tx) =>
      tx.select({
        id: webhooks.id,
        url: webhooks.url,
        events: webhooks.events,
        enabled: webhooks.enabled,
        createdAt: webhooks.createdAt,
        lastFiredAt: webhooks.lastFiredAt,
      }).from(webhooks)
        .where(and(eq(webhooks.workspaceId, request.ctx.workspaceId), eq(webhooks.enabled, true))),
    )

    return { data: result, requestId: request.id }
  })

  // POST /webhooks
  app.post('/', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'ADMIN')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'ADMIN role required', requestId: request.id } })
    }

    const body = z.object({
      url: z.string().url(),
      events: z.array(z.string()).min(1),
    }).parse(request.body)

    const secret = crypto.randomBytes(32).toString('hex')

    const [wh] = await withRls(app.db, request, async (tx) =>
      tx.insert(webhooks).values({
        id: uuid(),
        workspaceId: request.ctx.workspaceId,
        url: body.url,
        secret,
        events: body.events,
        createdBy: request.ctx.userId,
      }).returning(),
    )

    reply.code(201)
    // Secret returned once
    return { data: { ...wh, secret }, requestId: request.id }
  })

  // DELETE /webhooks/:id
  app.delete('/:id', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'ADMIN')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'ADMIN role required', requestId: request.id } })
    }

    const { id } = request.params as { id: string }

    await withRls(app.db, request, async (tx) =>
      tx.update(webhooks)
        .set({ enabled: false })
        .where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, request.ctx.workspaceId))),
    )

    reply.code(204)
  })
}
