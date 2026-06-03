import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { workspaces, users } from '../db/schema.js'
import { withRls } from '../db/helpers.js'
import { hasMinRole } from '@ctm/shared-types'
import { v4 as uuid } from 'uuid'

export const workspacesRouter: FastifyPluginAsync = async (app) => {
  // GET /workspaces
  app.get('/', async (request) => {
    const result = await withRls(app.db, request, async (tx) =>
      tx.select().from(workspaces).where(eq(workspaces.id, request.ctx.workspaceId)),
    )
    return { data: result, requestId: request.id }
  })

  // POST /workspaces — create a new workspace (any authenticated user)
  app.post('/', async (request, reply) => {
    const body = z.object({ name: z.string().min(1).max(255) }).parse(request.body)
    const workspaceId = uuid()
    const userId = request.ctx.userId

    const [ws] = await app.db.transaction(async (tx) => {
      const inserted = await tx.insert(workspaces).values({
        id: workspaceId,
        name: body.name,
        ownerId: userId,
      }).returning()

      // @ts-ignore -- Drizzle v0.41: .default() columns excluded from insert type
      await tx.insert(users).values({
        id: userId,
        workspaceId,
        email: '',
        name: userId,
        role: 'OWNER',
      })

      return inserted
    })

    reply.code(201)
    return { data: ws, requestId: request.id }
  })

  // GET /workspaces/:id
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    if (id !== request.ctx.workspaceId) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Cannot access another workspace', requestId: request.id } })
    }

    const [ws] = await withRls(app.db, request, async (tx) =>
      tx.select().from(workspaces).where(eq(workspaces.id, id)).limit(1),
    )

    if (!ws) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: `Workspace ${id} not found`, requestId: request.id } })
    }

    return { data: ws, requestId: request.id }
  })

  // PUT /workspaces/:id
  app.put('/:id', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'OWNER')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'OWNER role required', requestId: request.id } })
    }

    const { id } = request.params as { id: string }
    const body = z.object({
      name: z.string().min(1).max(255).optional(),
      settings: z.record(z.unknown()).optional(),
    }).parse(request.body)

    const [updated] = await withRls(app.db, request, async (tx) =>
      tx.update(workspaces)
        .set({
          ...(body.name !== undefined && { name: body.name }),
          ...(body.settings !== undefined && { settings: body.settings }),
        })
        .where(eq(workspaces.id, id))
        .returning(),
    )

    return { data: updated, requestId: request.id }
  })
}
