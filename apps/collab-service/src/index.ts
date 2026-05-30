import { createServer } from './server.js'
import { logger } from './logger.js'
import { env } from './env.js'

async function main() {
  const server = await createServer()
  server.listen()
  logger.info({ port: env.PORT }, 'CTM Collab Service started')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
