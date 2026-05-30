import './tracing.js'
import Fastify from 'fastify'
import { buildApp } from './app.js'
import { env } from './env.js'

const logger = {
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  level: env.LOG_LEVEL,
}

const server = Fastify({ logger })

async function main() {
  const app = await buildApp(server)

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    server.log.info(`CTM API Gateway listening on port ${env.PORT}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

main()
