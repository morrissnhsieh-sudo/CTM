import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { env } from '../env.js'

export const aiRouter: FastifyPluginAsync = async (app) => {
  // POST /ai/query — NL query (proxied to M6, streamed via SSE)
  app.post('/query', async (request, reply) => {
    const body = z.object({
      sheetId: z.string().uuid(),
      prompt: z.string().min(1).max(5000),
      mode: z.enum(['ask', 'analyze', 'generate', 'automate']).default('ask'),
      contextRange: z.string().optional(),
      dataConsent: z.boolean().default(false),
    }).parse(request.body)

    // Proxy to M6 AI service with SSE forwarding
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    try {
      const aiResponse = await fetch(`${env.AI_SERVICE_URL}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${request.headers.authorization?.slice(7) ?? ''}`,
          'X-Workspace-Id': request.ctx.workspaceId,
          'X-User-Id': request.ctx.userId,
          'X-User-Role': request.ctx.role,
        },
        body: JSON.stringify(body),
      })

      if (!aiResponse.ok || !aiResponse.body) {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ code: 'AI_SERVICE_ERROR' })}\n\n`)
        reply.raw.end()
        return
      }

      const reader = aiResponse.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        reply.raw.write(decoder.decode(value, { stream: true }))
      }
    } catch (err) {
      app.log.error({ err }, 'AI service proxy error')
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ code: 'PROXY_ERROR' })}\n\n`)
    } finally {
      reply.raw.end()
    }
  })

  // POST /ai/formula — Text-to-Formula
  app.post('/formula', async (request, reply) => {
    const body = z.object({
      sheetId: z.string().uuid(),
      description: z.string().min(1).max(2000),
      targetCell: z.string(),
      contextColumns: z.array(z.string()).default([]),
    }).parse(request.body)

    const aiResponse = await fetch(`${env.AI_SERVICE_URL}/formula`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': request.ctx.workspaceId,
        'X-User-Id': request.ctx.userId,
        'X-User-Role': request.ctx.role,
      },
      body: JSON.stringify(body),
    })

    if (!aiResponse.ok) {
      return reply.code(502).send({ error: { code: 'AI_SERVICE_ERROR', message: 'AI service unavailable', requestId: request.id } })
    }

    const data = await aiResponse.json() as unknown
    return { data, requestId: request.id }
  })

  // POST /ai/agent — Start LangGraph agent session
  app.post('/agent', async (request, reply) => {
    const body = z.object({
      sheetId: z.string().uuid(),
      agentType: z.enum(['data_analyst', 'data_cleaner', 'report_generator', 'workflow_suggester']),
      prompt: z.string().min(1).max(5000),
    }).parse(request.body)

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    try {
      const aiResponse = await fetch(`${env.AI_SERVICE_URL}/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Id': request.ctx.workspaceId,
          'X-User-Id': request.ctx.userId,
          'X-User-Role': request.ctx.role,
        },
        body: JSON.stringify(body),
      })

      if (!aiResponse.ok || !aiResponse.body) {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ code: 'AI_SERVICE_ERROR' })}\n\n`)
        reply.raw.end()
        return
      }

      const reader = aiResponse.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        reply.raw.write(decoder.decode(value, { stream: true }))
      }
    } catch (err) {
      app.log.error({ err }, 'Agent proxy error')
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ code: 'PROXY_ERROR' })}\n\n`)
    } finally {
      reply.raw.end()
    }
  })

  // POST /ai/formula/callback — M6 posts back =AI.* results
  app.post('/formula/callback', async (request, reply) => {
    const body = z.object({
      sheetId: z.string().uuid(),
      cellRef: z.string(),
      result: z.string(),
      cacheKey: z.string(),
    }).parse(request.body)

    app.log.info({ body }, 'AI formula callback received')
    // TODO: inject result into Yjs Y.Doc via M2 and update PostgreSQL cell
    return { ok: true, requestId: request.id }
  })
}
