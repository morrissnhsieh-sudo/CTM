import { Server } from '@hocuspocus/server'
import { Redis as RedisExtension } from '@hocuspocus/extension-redis'
import * as Y from 'yjs'
import pg from 'pg'
import Redis from 'ioredis'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { Kafka, type Producer } from 'kafkajs'
import { env } from './env.js'
import { logger } from './logger.js'
import { DocumentPersistence } from './persistence.js'
import { PresenceManager } from './presence.js'
import { KafkaPublisher } from './kafka.js'
import type { UserRole } from '@ctm/shared-types'

interface AuthData {
  userId: string
  workspaceId: string
  role: UserRole
  sheetId: string
}

const JWKS = createRemoteJWKSet(new URL(env.KEYCLOAK_JWKS_URI), {
  cooldownDuration: 300_000,
})

export async function createServer() {
  const pool = new pg.Pool({ connectionString: env.DB_URL, max: 10 })
  const redis = new Redis(env.REDIS_URL)

  const kafka = new Kafka({
    clientId: 'collab-service',
    brokers: env.KAFKA_BROKERS.split(','),
  })
  const producer = kafka.producer({ idempotent: true })
  await producer.connect()

  const persistence = new DocumentPersistence(pool, env.DEBOUNCE_WRITE_MS)
  const presence = new PresenceManager(redis)
  const publisher = new KafkaPublisher(producer)

  // Snapshot timer
  setInterval(() => persistence.flushSnapshots(), env.SNAPSHOT_INTERVAL_MS)

  const server = Server.configure({
    port: env.PORT,
    timeout: 30_000,

    // ─── Auth ─────────────────────────────────────────────────
    async onAuthenticate({ token, documentName }) {
      const sheetId = documentName

      try {
        const { payload } = await jwtVerify(token, JWKS, {
          issuer: env.KEYCLOAK_ISSUER,
        })

        const userId = payload.sub as string
        const workspaceId = payload['workspace_id'] as string
        const roles = (payload['roles'] as UserRole[]) ?? ['VIEWER']
        const role = roles[0] ?? 'VIEWER'

        logger.info({ userId, sheetId, role }, 'WebSocket authenticated')

        return { userId, workspaceId, role, sheetId } as AuthData
      } catch (err) {
        logger.warn({ err, sheetId }, 'WebSocket auth failed')
        throw new Error('Unauthorized')
      }
    },

    // ─── Load document from PostgreSQL ────────────────────────
    async onLoadDocument({ documentName }) {
      return persistence.loadDocument(documentName)
    },

    // ─── Persist document changes ─────────────────────────────
    async onChange({ documentName, document, context }) {
      const auth = context as AuthData

      // Debounced write to PostgreSQL
      persistence.scheduleWrite(documentName, document)

      // Extract changed cells and publish to Kafka
      await publisher.publishCellChanges(documentName, document, auth)
    },

    // ─── Store individual CRDT updates in update_log ──────────
    async onStoreDocument({ documentName, document, context }) {
      const auth = context as AuthData
      await persistence.writeSnapshot(documentName, document)
    },

    // ─── Connection events ────────────────────────────────────
    async onConnect({ documentName, context }) {
      const auth = context as AuthData
      await presence.setPresence(auth.workspaceId, auth.userId, {
        status: 'online',
        sheetId: documentName,
      })

      await publisher.publishPresence(documentName, auth, 'connected')
      logger.info({ userId: auth.userId, sheetId: documentName }, 'Client connected')
    },

    async onDisconnect({ documentName, context }) {
      const auth = context as AuthData
      await presence.removePresence(auth.workspaceId, auth.userId)
      await publisher.publishPresence(documentName, auth, 'disconnected')
      logger.info({ userId: auth.userId, sheetId: documentName }, 'Client disconnected')
    },

    // ─── Read-only enforcement ────────────────────────────────
    async onRequest({ documentName, context }) {
      const auth = context as AuthData
      if (auth.role === 'VIEWER' || auth.role === 'COMMENTER') {
        // Read-only: reject write messages silently by returning read-only mode
        return { readOnly: true }
      }
    },

    extensions: [
      // Redis pub/sub for horizontal scaling (multiple pods)
      new RedisExtension({
        host: new URL(env.REDIS_URL).hostname,
        port: parseInt(new URL(env.REDIS_URL).port || '6379'),
      }),
    ],
  })

  return server
}
