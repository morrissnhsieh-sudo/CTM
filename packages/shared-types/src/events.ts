// ─── Kafka Domain Events ─────────────────────────────────────────────────────

export interface BaseEvent {
  eventId: string
  timestamp: number   // Unix ms
  workspaceId: string
  userId: string
}

// ctm.cells
export interface CellUpdatedEvent extends BaseEvent {
  type: 'cell.updated'
  sheetId: string
  rowId: string
  colId: string
  cellRef: string  // "r{rowId}c{colId}"
  oldValue: import('./cell.js').CellValue
  newValue: import('./cell.js').CellValue
  formula: string | null
}

// ctm.rows
export interface RowCreatedEvent extends BaseEvent {
  type: 'row.created'
  sheetId: string
  rowId: string
  position: number
}

export interface RowUpdatedEvent extends BaseEvent {
  type: 'row.updated'
  sheetId: string
  rowId: string
  changedCols: string[]   // colIds
}

export interface RowDeletedEvent extends BaseEvent {
  type: 'row.deleted'
  sheetId: string
  rowId: string
}

// ctm.approvals
export interface ApprovalRequestedEvent extends BaseEvent {
  type: 'approval.requested'
  sheetId: string
  rowId: string
  approvalId: string
  approverIds: string[]
}

export interface ApprovalCompletedEvent extends BaseEvent {
  type: 'approval.completed'
  sheetId: string
  rowId: string
  approvalId: string
  decision: 'approved' | 'rejected'
}

// ctm.workflows
export interface WorkflowTriggeredEvent extends BaseEvent {
  type: 'workflow.triggered'
  sheetId: string
  triggerId: string
  rowId: string | null
  actionType: string
}

// ctm.ai.jobs
export interface AiFormulaJobEvent extends BaseEvent {
  type: 'ai.formula.job'
  sheetId: string
  cellRef: string
  formula: string
  contextRange: string | null
}

// ctm.notifications
export interface NotificationEvent extends BaseEvent {
  type: 'notification'
  notificationType: string
  recipientId: string
  payload: Record<string, unknown>
}

// ctm.audit
export interface AuditEvent extends BaseEvent {
  type: string
  action: string
  resourceType: string
  resourceId: string
  ipAddress: string | null
  userAgent: string | null
  metadata: Record<string, unknown>
}

export type KafkaEvent =
  | CellUpdatedEvent
  | RowCreatedEvent
  | RowUpdatedEvent
  | RowDeletedEvent
  | ApprovalRequestedEvent
  | ApprovalCompletedEvent
  | WorkflowTriggeredEvent
  | AiFormulaJobEvent
  | NotificationEvent
  | AuditEvent
