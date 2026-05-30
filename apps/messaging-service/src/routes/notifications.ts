import type { FastifyPluginAsync } from 'fastify'
import type pg from 'pg'
import type { Logger } from 'pino'
import { z } from 'zod'

const NotificationsRouterOptions = {
  pool: null as unknown as pg.Pool,
  logger: null as unknown as Logger,
}

export const NotificationsRouter: FastifyPluginAsync<typeof NotificationsRouterOptions> = async (app, opts) => {
  const { pool } = opts

  // GET /notifications — get user notifications
  app.get('/notifications', async (request) => {
    const userId = (request.headers['x-user-id'] as string) ?? ''
    const { unreadOnly = false } = request.query as { unreadOnly?: boolean }

    const result = await pool.query(
      `SELECT * FROM notifications
       WHERE user_id = $1
         ${unreadOnly ? 'AND read = FALSE' : ''}
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId],
    )

    return { data: result.rows, requestId: request.id }
  })

  // PUT /notifications/:id/read
  app.put('/notifications/:id/read', async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = (request.headers['x-user-id'] as string) ?? ''

    await pool.query(
      `UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2`,
      [id, userId],
    )

    reply.code(204)
  })

  // PUT /notifications/read-all
  app.put('/notifications/read-all', async (request, reply) => {
    const userId = (request.headers['x-user-id'] as string) ?? ''

    await pool.query(
      `UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE`,
      [userId],
    )

    reply.code(204)
  })

  // PUT /notifications/preferences
  app.put('/notifications/preferences', async (request) => {
    const userId = (request.headers['x-user-id'] as string) ?? ''

    const body = z.object({
      preferences: z.array(z.object({
        notificationType: z.string(),
        channel: z.enum(['in_app', 'email', 'webhook']),
        digestMode: z.enum(['immediate', 'hourly', 'daily']),
      })),
    }).parse(request.body)

    for (const pref of body.preferences) {
      await pool.query(
        `INSERT INTO notification_prefs (user_id, notification_type, channel, digest_mode)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id, notification_type, channel) DO UPDATE
         SET digest_mode = $4`,
        [userId, pref.notificationType, pref.channel, pref.digestMode],
      )
    }

    return { data: { updated: true }, requestId: request.id }
  })
}
