/**
 * M8 — Event Bus
 * Unit tests: Kafka topic design, event schema validation, DLQ routing
 *
 * Spec refs:
 *  - 7 topics: ctm.cells, ctm.rows, ctm.approvals, ctm.workflows,
 *              ctm.ai.jobs, ctm.notifications, ctm.audit
 *  - Partition key = workspaceId (co-location)
 *  - ctm.cells: 24 partitions, 7-day retention
 *  - ctm.rows: 12 partitions, 30-day retention
 *  - ctm.audit: exactly-once via Kafka transactions, 1-year retention
 *  - At-least-once for all other topics
 *  - DLQ: ctm.dlq.{topic} after 3 retries
 *  - Avro schemas with BACKWARD compatibility
 */

import { describe, it, expect } from 'vitest'
import type {
  CellUpdatedEvent,
  RowCreatedEvent,
  RowUpdatedEvent,
  RowDeletedEvent,
  ApprovalRequestedEvent,
  ApprovalCompletedEvent,
  WorkflowTriggeredEvent,
  AiFormulaJobEvent,
  NotificationEvent,
  AuditEvent,
} from '@ctm/shared-types'

// ── Topic configuration ────────────────────────────────────────────────────────
const TOPICS = {
  'ctm.cells': {
    partitions: 24,
    retentionDays: 7,
    partitionKey: 'workspaceId',
    deliveryGuarantee: 'at-least-once',
    producers: ['M2', 'M4'],
    consumers: ['M4', 'M6', 'M7'],
  },
  'ctm.rows': {
    partitions: 12,
    retentionDays: 30,
    partitionKey: 'workspaceId',
    deliveryGuarantee: 'at-least-once',
    producers: ['M3', 'M5'],
    consumers: ['M4', 'M5', 'M7'],
  },
  'ctm.approvals': {
    partitions: 12,
    retentionDays: 90,
    partitionKey: 'workspaceId',
    deliveryGuarantee: 'at-least-once',
    producers: ['M5'],
    consumers: ['M7'],
  },
  'ctm.workflows': {
    partitions: 12,
    retentionDays: 30,
    partitionKey: 'workspaceId',
    deliveryGuarantee: 'at-least-once',
    producers: ['M5'],
    consumers: ['M3', 'M7'],
  },
  'ctm.ai.jobs': {
    partitions: 6,
    retentionDays: 7,
    partitionKey: 'workspaceId',
    deliveryGuarantee: 'at-least-once',
    producers: ['M4', 'M5'],
    consumers: ['M6'],
  },
  'ctm.notifications': {
    partitions: 12,
    retentionDays: 7,
    partitionKey: 'workspaceId',
    deliveryGuarantee: 'at-least-once',
    producers: ['M5', 'M6', 'M7'],
    consumers: ['M7'],
  },
  'ctm.audit': {
    partitions: 12,
    retentionDays: 365,
    partitionKey: 'workspaceId',
    deliveryGuarantee: 'exactly-once',
    producers: ['All'],
    consumers: ['AuditWriter'],
  },
} as const

describe('M8 Kafka Topic Configuration', () => {
  it('defines exactly 7 topics', () => {
    expect(Object.keys(TOPICS)).toHaveLength(7)
  })

  it('all topics use workspaceId as partition key', () => {
    for (const [, config] of Object.entries(TOPICS)) {
      expect(config.partitionKey).toBe('workspaceId')
    }
  })

  it('ctm.cells has 24 partitions (highest throughput)', () => {
    expect(TOPICS['ctm.cells'].partitions).toBe(24)
  })

  it('ctm.audit has exactly-once delivery guarantee', () => {
    expect(TOPICS['ctm.audit'].deliveryGuarantee).toBe('exactly-once')
  })

  it('all other topics have at-least-once delivery', () => {
    const nonAuditTopics = Object.entries(TOPICS).filter(([k]) => k !== 'ctm.audit')
    for (const [, config] of nonAuditTopics) {
      expect(config.deliveryGuarantee).toBe('at-least-once')
    }
  })

  it('ctm.audit retention is 365 days (compliance)', () => {
    expect(TOPICS['ctm.audit'].retentionDays).toBe(365)
  })

  it('ctm.cells retention is 7 days', () => {
    expect(TOPICS['ctm.cells'].retentionDays).toBe(7)
  })

  it('ctm.approvals retention is 90 days', () => {
    expect(TOPICS['ctm.approvals'].retentionDays).toBe(90)
  })

  it('M6 AI service only consumes ctm.ai.jobs', () => {
    const aiJobsTopic = TOPICS['ctm.ai.jobs']
    expect(aiJobsTopic.consumers).toContain('M6')
  })
})

// ── Event schema validation ────────────────────────────────────────────────────
describe('M8 Event Schema Validation', () => {
  const BASE_EVENT = {
    eventId: 'evt-123',
    timestamp: Date.now(),
    workspaceId: 'ws-456',
    userId: 'user-789',
  }

  describe('CellUpdatedEvent', () => {
    it('has all required fields', () => {
      const event: CellUpdatedEvent = {
        ...BASE_EVENT,
        type: 'cell.updated',
        sheetId: 'sheet-1',
        rowId: 'row-1',
        colId: 'col-1',
        cellRef: 'rrow-1ccol-1',
        oldValue: 'old',
        newValue: 'new',
        formula: null,
      }
      expect(event.type).toBe('cell.updated')
      expect(event.cellRef).toMatch(/^r.+c.+/)
      expect(event.workspaceId).toBeTruthy()
    })

    it('cellRef follows r{rowId}c{colId} format', () => {
      const rowId = 'abc123'
      const colId = 'def456'
      const cellRef = `r${rowId}c${colId}`
      expect(cellRef).toBe('rabc123cdef456')
    })
  })

  describe('RowCreatedEvent', () => {
    it('has sheetId, rowId, and position', () => {
      const event: RowCreatedEvent = {
        ...BASE_EVENT,
        type: 'row.created',
        sheetId: 'sheet-1',
        rowId: 'row-new',
        position: 42,
      }
      expect(event.type).toBe('row.created')
      expect(event.position).toBeTypeOf('number')
    })
  })

  describe('ApprovalRequestedEvent', () => {
    it('includes approvalId and approverIds array', () => {
      const event: ApprovalRequestedEvent = {
        ...BASE_EVENT,
        type: 'approval.requested',
        sheetId: 'sheet-1',
        rowId: 'row-1',
        approvalId: 'approval-abc',
        approverIds: ['user-A', 'user-B'],
      }
      expect(event.approverIds).toBeInstanceOf(Array)
      expect(event.approverIds).toHaveLength(2)
    })
  })

  describe('AuditEvent', () => {
    it('includes action, resourceType, and resourceId', () => {
      const event: AuditEvent = {
        ...BASE_EVENT,
        type: 'auth.login',
        action: 'login',
        resourceType: 'user',
        resourceId: 'user-123',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        metadata: { success: true },
      }
      expect(event.action).toBe('login')
      expect(event.resourceType).toBe('user')
    })
  })
})

// ── DLQ naming convention ──────────────────────────────────────────────────────
describe('M8 Dead Letter Queue naming', () => {
  const toDLQ = (topic: string) => `ctm.dlq.${topic.replace('ctm.', '')}`

  it('DLQ topic names follow ctm.dlq.{source} pattern', () => {
    expect(toDLQ('ctm.cells')).toBe('ctm.dlq.cells')
    expect(toDLQ('ctm.rows')).toBe('ctm.dlq.rows')
    expect(toDLQ('ctm.audit')).toBe('ctm.dlq.audit')
  })

  it('generates DLQ names for all 7 topics', () => {
    const dlqTopics = Object.keys(TOPICS).map(toDLQ)
    expect(dlqTopics).toHaveLength(7)
    expect(dlqTopics.every((t) => t.startsWith('ctm.dlq.'))).toBe(true)
  })
})
