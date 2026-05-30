import fp from 'fastify-plugin'
import { Kafka, type Producer } from 'kafkajs'
import { env } from '../env.js'
import type { KafkaEvent } from '@ctm/shared-types'
import { v4 as uuid } from 'uuid'

declare module 'fastify' {
  interface FastifyInstance {
    publishEvent: (topic: string, event: KafkaEvent) => Promise<void>
  }
}

export const kafkaPlugin = fp(async (app) => {
  const kafka = new Kafka({
    clientId: env.KAFKA_CLIENT_ID,
    brokers: env.KAFKA_BROKERS.split(','),
  })

  const producer: Producer = kafka.producer({
    idempotent: true,
    transactionalId: undefined,
  })

  await producer.connect()

  const publishEvent = async (topic: string, event: KafkaEvent) => {
    await producer.send({
      topic,
      messages: [
        {
          key: (event as { workspaceId?: string }).workspaceId ?? uuid(),
          value: JSON.stringify(event),
          headers: {
            eventType: event.type,
            eventId: event.eventId,
          },
        },
      ],
    })
  }

  app.decorate('publishEvent', publishEvent)

  app.addHook('onClose', async () => {
    await producer.disconnect()
  })
})
