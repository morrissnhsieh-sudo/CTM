export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF'
export type ApprovalState = 'DRAFT' | 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'ESCALATED'

export interface Project {
  id: string
  workspaceId: string
  name: string
  status: string
  startDate: string | null
  endDate: string | null
  settings: Record<string, unknown>
}

export interface Task {
  id: string
  projectId: string
  sheetId: string
  rowId: string
  name: string
  startDate: string | null
  endDate: string | null
  durationDays: number | null
  assigneeId: string | null
  status: string
  isMilestone: boolean
  isCritical: boolean
  floatDays: number | null
  createdAt: Date
  updatedAt: Date
}

export interface TaskDependency {
  id: string
  fromTaskId: string
  toTaskId: string
  dependencyType: DependencyType
  lagDays: number
}

export interface CriticalPath {
  projectId: string
  criticalTaskIds: string[]
  totalDuration: number
  startDate: string
  endDate: string
  tasks: CpmTask[]
}

export interface CpmTask extends Task {
  earlyStart: string
  earlyFinish: string
  lateStart: string
  lateFinish: string
  totalFloat: number
  freeFloat: number
}

export interface ApprovalChain {
  id: string
  rowId: string
  sheetId: string
  workflowDef: ApprovalWorkflowDef
  currentState: ApprovalState
  history: ApprovalHistoryEntry[]
  createdAt: Date
}

export interface ApprovalWorkflowDef {
  steps: ApprovalStep[]
  slaHours: number
  escalationUserId: string | null
}

export interface ApprovalStep {
  order: number
  approverType: 'user' | 'role' | 'group'
  approverId: string
  condition?: string  // go-expr expression
  mode: 'sequential' | 'any_of'
  minApprovals?: number
}

export interface ApprovalHistoryEntry {
  action: 'submitted' | 'approved' | 'rejected' | 'escalated' | 'commented'
  userId: string
  note: string | null
  timestamp: string
}

export interface WorkflowTrigger {
  id: string
  sheetId: string
  eventType: 'row_created' | 'row_updated' | 'status_changed' | 'date_reached' | 'approval_completed' | 'webhook_received'
  conditions: string   // go-expr expression
  actions: TriggerAction[]
  enabled: boolean
  lastFiredAt: Date | null
}

export interface TriggerAction {
  type: 'send_notification' | 'update_cell' | 'create_row' | 'move_row' | 'trigger_approval' | 'call_webhook' | 'run_ai_agent'
  config: Record<string, unknown>
}
