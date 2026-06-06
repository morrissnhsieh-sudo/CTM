import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { users, apiTokens } from '../db/schema.js'
import { withRls } from '../db/helpers.js'
import { hasMinRole } from '@ctm/shared-types'
import crypto from 'node:crypto'
import { v4 as uuid } from 'uuid'

const PASSWORD_HASH_BYTES = 64
const PASSWORD_SALT_BYTES = 16

function buildPasswordHash(password: string) {
  const salt = crypto.randomBytes(PASSWORD_SALT_BYTES).toString('hex')
  const hash = crypto.scryptSync(password, salt, PASSWORD_HASH_BYTES, { N: 16384, r: 8, p: 1 })
  return `${salt}:${hash.toString('hex')}`
}

export const usersRouter: FastifyPluginAsync = async (app) => {
  // GET /users
  app.get('/', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'EDITOR')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'EDITOR role required', requestId: request.id } })
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

  // PUT /me
  app.put('/me', async (request) => {
    const body = z.object({
      name: z.string().min(1).max(100).optional(),
      avatarUrl: z.string().max(1000).nullable().optional(),
      organizationName: z.string().max(255).nullable().optional(),
      employeeId: z.string().max(100).nullable().optional(),
      tel: z.string().max(50).nullable().optional(),
    }).parse(request.body)

    const [updatedUser] = await withRls(app.db, request, async (tx) =>
      tx.update(users)
        .set({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
          ...(body.organizationName !== undefined ? { organizationName: body.organizationName } : {}),
          ...(body.employeeId !== undefined ? { employeeId: body.employeeId } : {}),
          ...(body.tel !== undefined ? { tel: body.tel } : {}),
        })
        .where(and(eq(users.id, request.ctx.userId), eq(users.workspaceId, request.ctx.workspaceId)))
        .returning()
    )

    return { data: updatedUser ?? null, requestId: request.id }
  })

  // POST / (Create/Invite user, Admin only)
  app.post('/', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'ADMIN')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'ADMIN role required', requestId: request.id } })
    }

    const body = z.object({
      email: z.string().email(),
      name: z.string().min(1).max(100),
      role: z.enum(['ADMIN', 'EDITOR', 'COMMENTER', 'VIEWER']),
      groupName: z.string().max(100).nullable().optional(),
      password: z.string().min(8).optional().default('Welcome123!'),
    }).parse(request.body)

    const email = body.email.toLowerCase().trim()

    const existingUser = await app.db.query.users.findFirst({
      where: (t, { eq, and }) => and(eq(t.email, email), eq(t.workspaceId, request.ctx.workspaceId)),
    })

    if (existingUser) {
      return reply.code(409).send({ error: { code: 'CONFLICT', message: 'User already exists in workspace', requestId: request.id } })
    }

    const userId = uuid()
    const passwordHash = buildPasswordHash(body.password)

    const [createdUser] = await withRls(app.db, request, async (tx) =>
      // @ts-ignore -- Drizzle type omission on default columns
      tx.insert(users).values({
        id: userId,
        workspaceId: request.ctx.workspaceId,
        email,
        name: body.name,
        role: body.role,
        groupName: body.groupName || null,
        passwordHash,
      }).returning()
    )

    return reply.code(201).send({ data: createdUser, requestId: request.id })
  })

  // PUT /:id (Update user, Admin only)
  app.put('/:id', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'ADMIN')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'ADMIN role required', requestId: request.id } })
    }

    const { id } = request.params as { id: string }

    const body = z.object({
      name: z.string().min(1).max(100).optional(),
      role: z.enum(['ADMIN', 'EDITOR', 'COMMENTER', 'VIEWER']).optional(),
      groupName: z.string().max(100).nullable().optional(),
    }).parse(request.body)

    const [updatedUser] = await withRls(app.db, request, async (tx) =>
      tx.update(users)
        .set({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.role !== undefined ? { role: body.role } : {}),
          ...(body.groupName !== undefined ? { groupName: body.groupName } : {}),
        })
        .where(and(eq(users.id, id), eq(users.workspaceId, request.ctx.workspaceId)))
        .returning()
    )

    if (!updatedUser) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found', requestId: request.id } })
    }

    return { data: updatedUser, requestId: request.id }
  })

  // DELETE /:id (Delete user, Admin only)
  app.delete('/:id', async (request, reply) => {
    if (!hasMinRole(request.ctx.role, 'ADMIN')) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'ADMIN role required', requestId: request.id } })
    }

    const { id } = request.params as { id: string }

    if (id === request.ctx.userId) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Cannot delete yourself', requestId: request.id } })
    }

    const deleted = await withRls(app.db, request, async (tx) =>
      tx.delete(users)
        .where(and(eq(users.id, id), eq(users.workspaceId, request.ctx.workspaceId)))
        .returning()
    )

    if (deleted.length === 0) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found', requestId: request.id } })
    }

    return reply.code(204).send()
  })
}
