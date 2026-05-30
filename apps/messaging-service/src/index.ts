import Fastify from 'fastify'
import { Server as SocketIoServer } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import Redis from 'ioredis'
import pg from 'pg'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { Kafka } from 'kafkajs'
import pino from 'pino'
import { CommentsRouter } from './routes/comments.js'
import { MessagesRouter } from './routes/messages.js'
import { NotificationsRouter } from './routes/notifications.js'
import { SocketHandler } from './socket/handler.js'
import { KafkaConsumer } from './kafka/consumer.js'
import { NotificationDispatcher } from './notifications/dispatcher.js'

const env = {
  PORT: parseInt(process.env['PORT'] ?? '3002'),
  DB_URL: process.env['DB_URL'] ?? '',
  REDIS_URL: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
  KAFKA_BROKERS: process.env['KAFKA_BROKERS'] ?? 'localhost:9092',
  KEYCLOAK_JWKS_URI: process.env['KEYCLOAK_JWKS_URI'] ?? '',
  KEYCLOAK_ISSUER: process.env['KEYCLOAK_ISSUER'] ?? '',
}

const logger = pino({ level: 'info' })

async function main() {
  // ─── Infrastructure ───────────────────────────────────────
  const pool = new pg.Pool({ connectionString: env.DB_URL, max: 15 })

  const pubClient = new Redis(env.REDIS_URL)
  const subClient = pubClient.duplicate()

  const kafka = new Kafka({ clientId: 'messaging-service', brokers: env.KAFKA_BROKERS.split(',') })
  const producer = kafka.producer()
  await producer.connect()

  const JWKS = createRemoteJWKSet(new URL(env.KEYCLOAK_JWKS_URI), { cooldownDuration: 300_000 })

  // ─── Fastify HTTP server ──────────────────────────────────
  const app = Fastify({ logger })

  const dispatcher = new NotificationDispatcher(pool, pubClient, producer, logger)

  app.register(CommentsRouter, { pool, producer, logger })
  app.register(MessagesRouter, { pool, producer, logger })
  app.register(NotificationsRouter, { pool, logger })

  app.get('/health', async () => ({ status: 'ok', service: 'messaging-service' }))

  // ─── Socket.io ────────────────────────────────────────────
  const io = new SocketIoServer(app.server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  })

  // Redis adapter for multi-pod scaling
  const adapter = createAdapter(pubClient, subClient)
  io.adapter(adapter)

  // Auth middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth['token'] as string
      if (!token) return next(new Error('Missing token'))

      const { payload } = await jwtVerify(token, JWKS, { issuer: env.KEYCLOAK_ISSUER })
      socket.data['userId'] = payload.sub
      socket.data['workspaceId'] = payload['workspace_id']
      next()
    } catch (err) {
      next(new Error('Unauthorized'))
    }
  })

  const socketHandler = new SocketHandler(io, pool, pubClient, dispatcher, logger)
  socketHandler.register()

  // ─── Kafka consumer ───────────────────────────────────────
  const kafkaConsumer = new KafkaConsumer(kafka, dispatcher, logger)
  await kafkaConsumer.start()

  // ─── Start server ─────────────────────────────────────────
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  logger.info(`Messaging service listening on port ${env.PORT}`)

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await kafkaConsumer.stop()
    await producer.disconnect()
    pubClient.disconnect()
    subClient.disconnect()
    await pool.end()
    process.exit(0)
  })
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error')
  process.exit(1)
})
