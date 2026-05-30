import type { FastifyPluginAsync } from 'fastify'
import type pg from 'pg'
import type { Producer } from 'kafkajs'
import type { Logger } from 'pino'
import { z } from 'zod'
import { v4 as uuid } from 'uuid'

const MessagesRouterOptions = {
  pool: null as unknown as pg.Pool,
  producer: null as unknown as Producer,
  logger: null as unknown as Logger,
}

export const MessagesRouter: FastifyPluginAsync<typeof MessagesRouterOptions> = async (app, opts) => {
  const { pool } = opts

  // GET /channels/:channelId/messages
  app.get('/channels/:channelId/messages', async (request) => {
    const { channelId } = request.params as { channelId: string }
    const { before, limit = 50 } = request.query as { before?: string; limit?: number }

    const result = await pool.query(
      `SELECT m.*, u.name AS author_name, u.avatar_url
       FROM messages m
       JOIN users u ON u.id = m.author_id
       WHERE m.channel_id = $1
         AND m.deleted_at IS NULL
         ${before ? 'AND m.created_at < $3' : ''}
       ORDER BY m.created_at DESC
       LIMIT $2`,
      before ? [channelId, Math.min(limit, 100), before] : [channelId, Math.min(limit, 100)],
    )

    return { data: result.rows.reverse(), requestId: request.id }
  })

  // GET /channels — list workspace channels
  app.get('/channels', async (request) => {
    const workspaceId = (request.headers['x-workspace-id'] as string) ?? ''
    const userId = (request.headers['x-user-id'] as string) ?? ''

    const result = await pool.query(
      `SELECT c.*, cm.last_seen_at
       FROM channels c
       JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
       WHERE c.workspace_id = $1
       ORDER BY c.created_at`,
      [workspaceId, userId],
    )

    return { data: result.rows, requestId: request.id }
  })

  // POST /channels — create channel
  app.post('/channels', async (request, reply) => {
    const workspaceId = (request.headers['x-workspace-id'] as string) ?? ''
    const userId = (request.headers['x-user-id'] as string) ?? ''

    const body = z.object({
      name: z.string().min(1).max(100),
      type: z.enum(['public', 'private', 'dm']).default('public'),
      members: z.array(z.string().uuid()).default([]),
    }).parse(request.body)

    const channelId = uuid()
    const allMembers = [...new Set([userId, ...body.members])]

    const { rows: [channel] } = await pool.query(
      `INSERT INTO channels (id, workspace_id, name, type, members)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [channelId, workspaceId, body.name, body.type, allMembers],
    )

    // Add members
    for (const memberId of allMembers) {
      await pool.query(
        `INSERT INTO channel_members (channel_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [channelId, memberId],
      )
    }

    reply.code(201)
    return { data: channel, requestId: request.id }
  })

  // GET /channels/search
  app.get('/messages/search', async (request) => {
    const workspaceId = (request.headers['x-workspace-id'] as string) ?? ''
    const { q } = z.object({ q: z.string().min(1).max(500) }).parse(request.query)

    const result = await pool.query(
      `SELECT m.*, c.name AS channel_name
       FROM messages m
       JOIN channels c ON c.id = m.channel_id
       WHERE c.workspace_id = $1
         AND m.deleted_at IS NULL
         AND m.body_tsvector @@ plainto_tsquery('english', $2)
       ORDER BY m.created_at DESC
       LIMIT 50`,
      [workspaceId, q],
    )

    return { data: result.rows, requestId: request.id }
  })
}
