import fp from 'fastify-plugin'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import crypto from 'node:crypto'
import { env } from '../env.js'
import type { RequestContext } from '@ctm/shared-types'
import type { UserRole } from '@ctm/shared-types'

declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestContext
  }
}

// Cache JWKS remotely
const JWKS = createRemoteJWKSet(new URL(env.KEYCLOAK_JWKS_URI), {
  cooldownDuration: 300_000,  // 5 min cache
})

const INTERNAL_SERVICES = new Set(['pm-service', 'ai-service', 'messaging-service'])
const PAT_PREFIX = 'ctm_pat_'

export const authPlugin = fp(async (app) => {
  app.decorateRequest('ctx', null)

  app.addHook('preHandler', async (request, reply) => {
    // Skip auth for health + docs
    const path = request.routerPath ?? request.url
    if (path === '/health' || path.startsWith('/v1/openapi') || path.startsWith('/mcp/auth')) {
      return
    }

    try {
      const authHeader = request.headers.authorization ?? ''
      const workspaceId = request.headers['x-workspace-id'] as string | undefined

      // ── mTLS internal service ───────────────────────────
      const clientCert = request.headers['x-client-cert-cn'] as string | undefined
      if (clientCert && INTERNAL_SERVICES.has(clientCert)) {
        request.ctx = {
          userId: `service:${clientCert}`,
          workspaceId: workspaceId ?? '',
          role: 'ADMIN',
          authMethod: 'mtls',
        }
        return
      }

      // ── Personal Access Token ───────────────────────────
      if (authHeader.startsWith(PAT_PREFIX) || authHeader.startsWith(`Bearer ${PAT_PREFIX}`)) {
        const raw = authHeader.replace('Bearer ', '')
        const hash = crypto.createHash('sha256').update(raw).digest('hex')

        // Check Redis cache first
        const cached = await app.redis.get(`token:${hash}`)
        if (cached) {
          request.ctx = JSON.parse(cached) as RequestContext
          return
        }

        const token = await app.db.query.apiTokens.findFirst({
          where: (t, { eq, and, or, isNull, gt }) =>
            and(
              eq(t.tokenHash, hash),
              or(isNull(t.expiresAt), gt(t.expiresAt, new Date())),
            ),
        })

        if (!token) {
          return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token', requestId: request.id as string } })
        }

        const ctx: RequestContext = {
          userId: token.userId,
          workspaceId: token.workspaceId,
          role: token.role as UserRole,
          authMethod: 'pat',
        }

        await app.redis.setex(`token:${hash}`, 300, JSON.stringify(ctx))
        request.ctx = ctx
        return
      }

      // ── JWT Bearer ──────────────────────────────────────
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7)
        const { payload } = await jwtVerify(token, JWKS, {
          issuer: env.KEYCLOAK_ISSUER,
        })

        const jwtPayload = payload as {
          sub?: string
          workspace_id?: string
          roles?: string[]
          email?: string
        }

        if (!jwtPayload.sub || !jwtPayload.workspace_id) {
          return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid token claims', requestId: request.id as string } })
        }

        // Prevent cross-workspace token reuse
        if (workspaceId && workspaceId !== jwtPayload.workspace_id) {
          return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Token workspace mismatch', requestId: request.id as string } })
        }

        const roles = (jwtPayload.roles ?? ['VIEWER']) as UserRole[]
        const role = roles[0] ?? 'VIEWER'

        request.ctx = {
          userId: jwtPayload.sub,
          workspaceId: jwtPayload.workspace_id,
          role,
          authMethod: 'jwt',
        }
        return
      }

      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header', requestId: request.id as string } })
    } catch (err) {
      app.log.warn({ err }, 'Auth error')
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication failed', requestId: request.id as string } })
    }
  })
})
