export type ColumnType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'checkbox'
  | 'dropdown'
  | 'multi_select'
  | 'attachment'
  | 'formula'
  | 'url'
  | 'contact'
  | 'auto_number'
  | 'ai_generated'

export interface Column {
  id: string
  sheetId: string
  name: string
  type: ColumnType
  position: number
  width: number
  frozen: boolean
  hidden: boolean
  format: ColumnFormat
  validation: ColumnValidation | null
}

export interface ColumnFormat {
  currencySymbol?: string
  dateFormat?: string
  decimalPlaces?: number
  dropdownOptions?: DropdownOption[]
  prefix?: string
  suffix?: string
}

export interface DropdownOption {
  label: string
  color?: string
}

export interface ColumnValidation {
  required?: boolean
  min?: number | string
  max?: number | string
  regex?: string
  allowedValues?: string[]
  errorMessage?: string
}
