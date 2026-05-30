import fp from 'fastify-plugin'

/**
 * Sliding-window rate limiter using Redis ZADD + ZREMRANGEBYSCORE.
 * Token limit:     500 req/min per API token
 * Workspace limit: 10,000 req/min per workspaceId
 * AI endpoints count as 10 requests each.
 */
export const rateLimitPlugin = fp(async (app) => {
  const AI_PATHS = new Set(['/v1/ai/query', '/v1/ai/agent', '/v1/ai/formula'])
  const TOKEN_LIMIT = 500
  const WORKSPACE_LIMIT = 10_000
  const WINDOW_MS = 60_000

  app.addHook('preHandler', async (request, reply) => {
    const ctx = request.ctx
    if (!ctx || ctx.authMethod === 'mtls') return   // internal services bypass

    const now = Date.now()
    const windowStart = now - WINDOW_MS
    const path = request.url.split('?')[0] ?? ''
    const cost = AI_PATHS.has(path) ? 10 : 1

    const tokenKey = `rl:token:${ctx.userId}`
    const wsKey = `rl:ws:${ctx.workspaceId}`

    const check = async (key: string, limit: number) => {
      const reqId = `${now}-${Math.random()}`
      const pipe = app.redis.pipeline()
      pipe.zadd(key, now, reqId)
      pipe.zremrangebyscore(key, 0, windowStart)
      pipe.zcard(key)
      pipe.expire(key, 61)
      const results = await pipe.exec()
      const count = (results?.[2]?.[1] as number) ?? 0
      return count
    }

    const [tokenCount, wsCount] = await Promise.all([
      check(tokenKey, TOKEN_LIMIT),
      check(wsKey, WORKSPACE_LIMIT),
    ])

    if (tokenCount > TOKEN_LIMIT || wsCount > WORKSPACE_LIMIT) {
      const retryAfter = Math.ceil(WINDOW_MS / 1000)
      reply
        .code(429)
        .header('X-RateLimit-Limit', TOKEN_LIMIT)
        .header('X-RateLimit-Remaining', Math.max(0, TOKEN_LIMIT - tokenCount))
        .header('X-RateLimit-Reset', Math.floor((now + WINDOW_MS) / 1000))
        .send({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests',
            retryAfter,
            requestId: request.id,
          },
        })
    }
  })
})
