export interface Sheet {
  id: string
  workspaceId: string
  projectId: string | null
  title: string
  description: string | null
  createdBy: string
  settings: SheetSettings
  createdAt: Date
  updatedAt: Date
  archivedAt: Date | null
  folderId: string | null
}

export interface Folder {
  id: string
  workspaceId: string
  parentId: string | null
  name: string
  createdAt: Date
}

export interface SheetSettings {
  defaultRowHeight: number
  frozenRows: number
  frozenCols: number
  theme: 'default' | 'compact' | 'spacious'
  conditionalFormatRules: ConditionalFormatRule[]
}

export interface ConditionalFormatRule {
  id: string
  colId: string
  condition: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'is_empty' | 'is_not_empty'
  value: string
  style: Partial<CellFormat>
}

export interface CellFormat {
  bold: boolean
  italic: boolean
  underline: boolean
  fontSize: number
  fontColor: string
  bgColor: string
  borderStyle: 'none' | 'thin' | 'thick'
  textAlign: 'left' | 'center' | 'right'
  numberFormat: string | null
  dateFormat: string | null
  wrapText: boolean
}
