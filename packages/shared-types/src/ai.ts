export type AiMode = 'ask' | 'analyze' | 'generate' | 'automate'

export interface AiQueryRequest {
  sheetId: string
  prompt: string
  mode: AiMode
  contextRange?: string  // A1:D10 style
  dataConsent?: boolean
}

export interface AiQueryResponse {
  sql?: string
  explanation: string
  rows?: Record<string, unknown>[]
  chartSuggestion?: 'bar' | 'line' | 'pie' | null
}

export interface AiFormulaRequest {
  sheetId: string
  description: string
  targetCell: string
  contextColumns: string[]
}

export interface AiFormulaResponse {
  formula: string
  explanation: string
  valid: boolean
}

export interface AiFormulaEvalRequest {
  formula: string
  cellRef: string
  contextRange: string | null
  sheetId: string
  workspaceId: string
  userId: string
}

export interface AiAgentSession {
  id: string
  userId: string
  sheetId: string
  graphState: Record<string, unknown>
  createdAt: Date
  lastActiveAt: Date
}

export type AgentType = 'data_analyst' | 'data_cleaner' | 'report_generator' | 'workflow_suggester'
