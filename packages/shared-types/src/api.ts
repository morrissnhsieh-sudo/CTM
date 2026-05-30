// ─── Standardised API Response Envelope ─────────────────────────────────────

export interface ApiError {
  code: string
  message: string
  requestId: string
  details?: Record<string, string[]>  // field-level validation errors
}

export interface ApiResponse<T> {
  data: T
  requestId: string
  timestamp: string
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  hasNextPage: boolean
  requestId: string
}

export interface PaginationQuery {
  page?: number
  pageSize?: number
}

// Standard error codes
export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SHEET_NOT_FOUND: 'SHEET_NOT_FOUND',
  ROW_NOT_FOUND: 'ROW_NOT_FOUND',
  COLUMN_NOT_FOUND: 'COLUMN_NOT_FOUND',
  CIRCULAR_REFERENCE: 'CIRCULAR_REFERENCE',
  INSUFFICIENT_SCOPE: 'INSUFFICIENT_SCOPE',
  INJECTION_DETECTED: 'INJECTION_DETECTED',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode]
