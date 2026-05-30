import type { Kafka } from 'kafkajs'
import type { Logger } from 'pino'
import type { NotificationDispatcher } from '../notifications/dispatcher.js'

const TOPICS = ['ctm.approvals', 'ctm.workflows', 'ctm.rows', 'ctm.notifications']

export class KafkaConsumer {
  private consumer

  constructor(
    kafka: Kafka,
    private dispatcher: NotificationDispatcher,
    private logger: Logger,
  ) {
    this.consumer = kafka.consumer({ groupId: 'messaging-service' })
  }

  async start(): Promise<void> {
    await this.consumer.connect()
    await this.consumer.subscribe({ topics: TOPICS, fromBeginning: false })

    // Start digest batch processor every 60s
    setInterval(() => {
      this.dispatcher.processDigests().catch((err) => {
        this.logger.error({ err }, 'Digest processing failed')
      })
    }, 60_000)

    void this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return

        try {
          const event = JSON.parse(message.value.toString()) as {
            type: string
            workspaceId: string
            userId?: string
            recipientId?: string
            payload?: Record<string, unknown>
          }

          await this.handleEvent(topic, event)
        } catch (err) {
          this.logger.error({ err, topic }, 'Kafka message processing failed')
        }
      },
    })

    this.logger.info({ topics: TOPICS }, 'Kafka consumer started')
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect()
  }

  private async handleEvent(topic: string, event: {
    type: string
    workspaceId: string
    userId?: string
    recipientId?: string
    payload?: Record<string, unknown>
  }): Promise<void> {
    const workspaceId = event.workspaceId
    const payload = event.payload ?? event

    switch (event.type) {
      case 'approval.requested':
        // Notify approvers
        await this.dispatcher.dispatch(
          event.userId ?? '',
          workspaceId,
          'approval_request',
          payload,
        )
        break

      case 'approval.completed':
        // Notify requester of decision
        await this.dispatcher.dispatch(
          event.userId ?? '',
          workspaceId,
          'approval_completed',
          payload,
        )
        break

      case 'workflow.triggered':
        // Fan-out workflow notifications
        await this.dispatcher.dispatch(
          event.userId ?? '',
          workspaceId,
          'workflow_triggered',
          payload,
        )
        break

      case 'notification':
        // Direct notification from M5/M6
        const recipientId = event.recipientId ?? event.userId ?? ''
        if (recipientId) {
          await this.dispatcher.dispatch(recipientId, workspaceId, event.type, payload)
        }
        break

      default:
        this.logger.debug({ type: event.type, topic }, 'Unhandled event type')
    }
  }
}
