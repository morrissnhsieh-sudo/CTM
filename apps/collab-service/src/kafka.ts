import type { Producer } from 'kafkajs'
import * as Y from 'yjs'
import { v4 as uuid } from 'uuid'
import type { CellUpdatedEvent } from '@ctm/shared-types'

/**
 * KafkaPublisher — publishes domain events to Kafka topics.
 * M2 publishes: ctm.cells, ctm.presence
 */
export class KafkaPublisher {
  constructor(private producer: Producer) {}

  /**
   * Extract cell changes from the Y.Doc and publish to ctm.cells.
   * Called on every onChange event from Hocuspocus.
   */
  async publishCellChanges(
    sheetId: string,
    doc: Y.Doc,
    auth: { userId: string; workspaceId: string },
  ) {
    const cellsMap = doc.getMap<Y.Map<unknown>>('cells')

    // Iterate over all cells and emit changed ones
    // In practice, HocusPocus passes a diff — here we publish a synthetic event
    // The formula engine (M4) will process via its own Kafka consumer
    const events: CellUpdatedEvent[] = []

    cellsMap.forEach((cell, cellRef) => {
      const value = cell.get('value')
      const formula = cell.get('formula') as string | null

      events.push({
        eventId: uuid(),
        type: 'cell.updated',
        timestamp: Date.now(),
        workspaceId: auth.workspaceId,
        userId: auth.userId,
        sheetId,
        rowId: '',
        colId: '',
        cellRef,
        oldValue: null,
        newValue: value as import('@ctm/shared-types').CellValue,
        formula,
      })
    })

    if (events.length === 0) return

    await this.producer.sendBatch({
      topicMessages: [{
        topic: 'ctm.cells',
        messages: events.map(e => ({
          key: e.workspaceId,
          value: JSON.stringify(e),
          headers: { eventType: e.type },
        })),
      }],
    })
  }

  async publishPresence(
    sheetId: string,
    auth: { userId: string; workspaceId: string },
    action: 'connected' | 'disconnected',
  ) {
    await this.producer.send({
      topic: 'ctm.cells',
      messages: [{
        key: auth.workspaceId,
        value: JSON.stringify({
          eventId: uuid(),
          type: action === 'connected' ? 'doc.connected' : 'doc.disconnected',
          timestamp: Date.now(),
          workspaceId: auth.workspaceId,
          userId: auth.userId,
          sheetId,
        }),
      }],
    })
  }
}
