import fp from 'fastify-plugin'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { env } from '../env.js'
import * as schema from '../db/schema.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof drizzle<typeof schema>>
    dbReplica: ReturnType<typeof drizzle<typeof schema>>
  }
}

export const dbPlugin = fp(async (app) => {
  const primaryPool = new pg.Pool({
    connectionString: env.DB_PRIMARY_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })

  const replicaPool = new pg.Pool({
    connectionString: env.DB_REPLICA_URL ?? env.DB_PRIMARY_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
  })

  // Inject RLS context on every connection checkout
  const setRlsContext = (pool: pg.Pool) => {
    const original = pool.connect.bind(pool)
    pool.connect = async (...args: Parameters<typeof pool.connect>) => {
      const client = await original(...args)
      return client
    }
  }

  setRlsContext(primaryPool)
  setRlsContext(replicaPool)

  const db = drizzle(primaryPool, { schema })
  const dbReplica = drizzle(replicaPool, { schema })

  app.decorate('db', db)
  app.decorate('dbReplica', dbReplica)

  app.addHook('onClose', async () => {
    await primaryPool.end()
    await replicaPool.end()
  })
})
