import type { Server as SocketIoServer, Socket } from 'socket.io'
import type pg from 'pg'
import type Redis from 'ioredis'
import type { Logger } from 'pino'
import type { NotificationDispatcher } from '../notifications/dispatcher.js'

interface SocketData {
  userId: string
  workspaceId: string
}

export class SocketHandler {
  constructor(
    private io: SocketIoServer,
    private pool: pg.Pool,
    private redis: Redis,
    private dispatcher: NotificationDispatcher,
    private logger: Logger,
  ) {}

  register() {
    this.io.on('connection', (socket: Socket) => {
      const { userId, workspaceId } = socket.data as SocketData
      this.logger.info({ userId, workspaceId }, 'Client connected')

      this.handleConnection(socket, userId, workspaceId).catch((err) => {
        this.logger.error({ err, userId }, 'Connection setup error')
        socket.disconnect()
      })
    })
  }

  private async handleConnection(socket: Socket, userId: string, workspaceId: string) {
    // ── Join rooms ──────────────────────────────────────────
    await socket.join(`workspace:${workspaceId}`)
    await socket.join(`user:${userId}`)

    // Load and join channel memberships
    const channels = await this.pool.query<{ channel_id: string }>(
      `SELECT channel_id FROM channel_members WHERE user_id = $1`,
      [userId],
    )
    for (const row of channels.rows) {
      await socket.join(`channel:${row.channel_id}`)
    }

    // ── Presence ─────────────────────────────────────────────
    await this.redis.hset(
      `presence:${workspaceId}`,
      userId,
      JSON.stringify({ userId, status: 'online', lastSeen: Date.now() }),
    )
    await this.redis.expire(`presence:${workspaceId}`, 30)

    this.io.to(`workspace:${workspaceId}`).emit('presence:update', {
      userId,
      status: 'online',
      lastSeen: Date.now(),
    })

    // ── Heartbeat ────────────────────────────────────────────
    const heartbeat = setInterval(async () => {
      await this.redis.hset(
        `presence:${workspaceId}`,
        userId,
        JSON.stringify({ userId, status: 'online', lastSeen: Date.now() }),
      )
      await this.redis.expire(`presence:${workspaceId}`, 30)
    }, 25_000)

    socket.on('pong', () => {
      // Client responded to heartbeat ping
    })

    const pingTimer = setInterval(() => {
      socket.emit('ping')
    }, 25_000)

    // ── Message events ────────────────────────────────────────
    socket.on('message:send', async (data: { channelId: string; body: string; attachments?: unknown[] }) => {
      try {
        const { rows: [msg] } = await this.pool.query(
          `INSERT INTO messages (channel_id, author_id, body, attachments)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [data.channelId, userId, data.body, JSON.stringify(data.attachments ?? [])],
        )

        this.io.to(`channel:${data.channelId}`).emit('message:new', msg)

        // Update last_seen for sender
        await this.pool.query(
          `UPDATE channel_members SET last_seen_at = NOW()
           WHERE channel_id = $1 AND user_id = $2`,
          [data.channelId, userId],
        )
      } catch (err) {
        this.logger.error({ err }, 'Failed to send message')
        socket.emit('error', { code: 'MESSAGE_SEND_FAILED' })
      }
    })

    // ── Channel join ──────────────────────────────────────────
    socket.on('channel:join', async (channelId: string) => {
      await socket.join(`channel:${channelId}`)
      socket.emit('channel:joined', { channelId })
    })

    // ── Typing indicator ──────────────────────────────────────
    socket.on('typing:start', (data: { channelId: string }) => {
      socket.to(`channel:${data.channelId}`).emit('typing:update', {
        userId,
        channelId: data.channelId,
        typing: true,
      })
    })

    socket.on('typing:stop', (data: { channelId: string }) => {
      socket.to(`channel:${data.channelId}`).emit('typing:update', {
        userId,
        channelId: data.channelId,
        typing: false,
      })
    })

    // ── Disconnect ────────────────────────────────────────────
    socket.on('disconnect', async () => {
      clearInterval(heartbeat)
      clearInterval(pingTimer)

      await this.redis.hdel(`presence:${workspaceId}`, userId)

      this.io.to(`workspace:${workspaceId}`).emit('presence:update', {
        userId,
        status: 'offline',
        lastSeen: Date.now(),
      })

      this.logger.info({ userId, workspaceId }, 'Client disconnected')
    })
  }
}
