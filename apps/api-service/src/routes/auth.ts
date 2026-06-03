import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import crypto from 'node:crypto'
import { SignJWT } from 'jose'
import { v4 as uuid } from 'uuid'
import { users, workspaces } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { env } from '../env.js'

const PASSWORD_HASH_BYTES = 64
const PASSWORD_SALT_BYTES = 16

function buildPasswordHash(password: string) {
  const salt = crypto.randomBytes(PASSWORD_SALT_BYTES).toString('hex')
  const hash = crypto.scryptSync(password, salt, PASSWORD_HASH_BYTES, { N: 16384, r: 8, p: 1 })
  return `${salt}:${hash.toString('hex')}`
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) return false
  const derived = crypto.scryptSync(password, salt, PASSWORD_HASH_BYTES, { N: 16384, r: 8, p: 1 })
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), derived)
}

function signToken(user: { id: string; workspaceId: string; role: string; email: string; name: string }) {
  const secret = new TextEncoder().encode(env.JWT_SECRET)

  return new SignJWT({
    workspace_id: user.workspaceId,
    roles: [user.role],
    email: user.email,
    name: user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(env.JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(secret)
}

export const authRouter: FastifyPluginAsync = async (app) => {
  app.post('/login', async (request, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(8) }).parse(request.body)
    const email = body.email.toLowerCase().trim()

    const [user] = await app.db.select().from(users).where(eq(users.email, email)).limit(1)

    if (!user || !user.passwordHash || !verifyPassword(body.password, user.passwordHash)) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials', requestId: request.id } })
    }

    const token = await signToken({
      id: user.id,
      workspaceId: user.workspaceId,
      role: user.role,
      email: user.email,
      name: user.name,
    })

    return {
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          workspaceId: user.workspaceId,
        },
      },
      requestId: request.id,
    }
  })

  app.post('/register', async (request, reply) => {
    const body = z.object({
      email: z.string().email(),
      name: z.string().min(1).max(100),
      password: z.string().min(8),
      workspaceName: z.string().min(1).max(255).optional(),
    }).parse(request.body)

    const email = body.email.toLowerCase().trim()

    const existingUser = await app.db.query.users.findFirst({
      where: (t, { eq }) => eq(t.email, email),
    })

    if (existingUser) {
      return reply.code(409).send({ error: { code: 'CONFLICT', message: 'Email already registered', requestId: request.id } })
    }

    const userId = uuid()
    const workspaceId = uuid()
    const passwordHash = buildPasswordHash(body.password)

    const workspace = await app.db.transaction(async (tx) => {
      const [createdWorkspace] = await tx.insert(workspaces).values({
        id: workspaceId,
        name: body.workspaceName ?? `${body.name}'s workspace`,
        ownerId: userId,
      }).returning()

      // @ts-ignore -- Drizzle v0.41: .default() columns excluded from insert type
      await tx.insert(users).values({
        id: userId,
        workspaceId,
        email,
        name: body.name,
        role: 'OWNER',
        passwordHash,
      })

      return createdWorkspace
    })

    const token = await signToken({
      id: userId,
      workspaceId,
      role: 'OWNER',
      email,
      name: body.name,
    })

    return reply.code(201).send({
      data: {
        token,
        user: {
          id: userId,
          email,
          name: body.name,
          role: 'OWNER',
          workspaceId,
        },
        workspace,
      },
      requestId: request.id,
    })
  })
}
