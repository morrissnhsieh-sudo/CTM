import type { FastifyPluginAsync } from 'fastify'
import type pg from 'pg'
import type { Producer } from 'kafkajs'
import type { Logger } from 'pino'
import { z } from 'zod'
import { v4 as uuid } from 'uuid'

const CreateCommentBody = z.object({
  targetType: z.enum(['cell', 'row', 'column', 'sheet']),
  targetRef: z.string(),
  parentId: z.string().uuid().nullable().optional(),
  body: z.string().min(1).max(10_000),
})

const CommentsRouterOptions = {
  pool: null as unknown as pg.Pool,
  producer: null as unknown as Producer,
  logger: null as unknown as Logger,
}

export const CommentsRouter: FastifyPluginAsync<typeof CommentsRouterOptions> = async (app, opts) => {
  const { pool } = opts

  // GET /sheets/:sheetId/comments
  app.get('/sheets/:sheetId/comments', async (request, reply) => {
    const { sheetId } = request.params as { sheetId: string }
    const { targetRef } = request.query as { targetRef?: string }

    const result = await pool.query(
      `SELECT c.*, u.name AS author_name, u.avatar_url
       FROM comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.sheet_id = $1
         AND c.deleted_at IS NULL
         ${targetRef ? 'AND c.target_ref = $2' : ''}
       ORDER BY c.created_at ASC`,
      targetRef ? [sheetId, targetRef] : [sheetId],
    )

    return { data: result.rows, requestId: request.id }
  })

  // POST /sheets/:sheetId/comments
  app.post('/sheets/:sheetId/comments', async (request, reply) => {
    const { sheetId } = request.params as { sheetId: string }
    const userId = (request.headers['x-user-id'] as string) ?? ''
    const workspaceId = (request.headers['x-workspace-id'] as string) ?? ''

    const body = CreateCommentBody.parse(request.body)

    const { rows: [comment] } = await pool.query(
      `INSERT INTO comments
       (id, workspace_id, sheet_id, target_type, target_ref, parent_id, author_id, body)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [uuid(), workspaceId, sheetId, body.targetType, body.targetRef,
       body.parentId ?? null, userId, body.body],
    )

    reply.code(201)
    return { data: comment, requestId: request.id }
  })

  // POST /comments/:commentId/reactions
  app.post('/comments/:commentId/reactions', async (request, reply) => {
    const { commentId } = request.params as { commentId: string }
    const userId = (request.headers['x-user-id'] as string) ?? ''
    const { emoji } = z.object({ emoji: z.string().max(10) }).parse(request.body)

    await pool.query(
      `INSERT INTO comment_reactions (comment_id, user_id, emoji)
       VALUES ($1, $2, $3)
       ON CONFLICT (comment_id, user_id, emoji) DO NOTHING`,
      [commentId, userId, emoji],
    )

    reply.code(204)
  })

  // PUT /comments/:commentId/resolve
  app.put('/comments/:commentId/resolve', async (request, reply) => {
    const { commentId } = request.params as { commentId: string }
    const userId = (request.headers['x-user-id'] as string) ?? ''

    await pool.query(
      `UPDATE comments
       SET resolved = TRUE, resolved_by = $2, resolved_at = NOW()
       WHERE id = $1`,
      [commentId, userId],
    )

    return { data: { resolved: true }, requestId: request.id }
  })

  // DELETE /comments/:commentId
  app.delete('/comments/:commentId', async (request, reply) => {
    const { commentId } = request.params as { commentId: string }
    const userId = (request.headers['x-user-id'] as string) ?? ''

    await pool.query(
      `UPDATE comments SET deleted_at = NOW()
       WHERE id = $1 AND author_id = $2`,
      [commentId, userId],
    )

    reply.code(204)
  })
}
