import {
  pgTable, pgSchema, uuid, text, boolean, integer, bigint,
  jsonb, timestamp, primaryKey, uniqueIndex, index,
  customType,
} from 'drizzle-orm/pg-core'

// ─── Schemas ─────────────────────────────────────────────────────────────────
export const collabSchema = pgSchema('collab')
export const pmSchema = pgSchema('pm')
export const aiSchema = pgSchema('ai')

// ─── Workspaces ───────────────────────────────────────────────────────────────
export const workspaces = pgTable('workspaces', {
  id:          uuid('id').primaryKey().defaultRandom(),
  name:        text('name').notNull(),
  plan:        text('plan').notNull().default('free'),
  ownerId:     uuid('owner_id').notNull(),
  settings:    jsonb('settings').notNull().default({}),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:   timestamp('deleted_at', { withTimezone: true }),
})

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  email:       text('email').notNull(),
  name:        text('name').notNull(),
  avatarUrl:   text('avatar_url'),
  role:        text('role').notNull().default('VIEWER'),
  lastActive:  timestamp('last_active', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  workspaceEmailUniq: uniqueIndex('users_workspace_email_uniq').on(t.workspaceId, t.email),
}))

// ─── Sheets ───────────────────────────────────────────────────────────────────
export const sheets = pgTable('sheets', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId:   uuid('project_id'),
  title:       text('title').notNull(),
  description: text('description'),
  createdBy:   uuid('created_by').notNull().references(() => users.id),
  settings:    jsonb('settings').notNull().default({}),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt:  timestamp('archived_at', { withTimezone: true }),
})

// ─── Columns ─────────────────────────────────────────────────────────────────
export const columns = pgTable('columns', {
  id:          uuid('id').primaryKey().defaultRandom(),
  sheetId:     uuid('sheet_id').notNull().references(() => sheets.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  type:        text('type').notNull(),
  position:    integer('position').notNull(),
  width:       integer('width').notNull().default(150),
  frozen:      boolean('frozen').notNull().default(false),
  hidden:      boolean('hidden').notNull().default(false),
  format:      jsonb('format').notNull().default({}),
  validation:  jsonb('validation'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Rows ─────────────────────────────────────────────────────────────────────
export const rows = pgTable('rows', {
  id:          uuid('id').primaryKey().defaultRandom(),
  sheetId:     uuid('sheet_id').notNull().references(() => sheets.id, { onDelete: 'cascade' }),
  position:    integer('position').notNull(),
  createdBy:   uuid('created_by').notNull().references(() => users.id),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:   timestamp('deleted_at', { withTimezone: true }),
})

// ─── Cells ────────────────────────────────────────────────────────────────────
export const cells = pgTable('cells', {
  rowId:       uuid('row_id').notNull().references(() => rows.id, { onDelete: 'cascade' }),
  colId:       uuid('col_id').notNull().references(() => columns.id, { onDelete: 'cascade' }),
  value:       text('value'),
  formula:     text('formula'),
  format:      jsonb('format').notNull().default({}),
  updatedBy:   uuid('updated_by').notNull().references(() => users.id),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.rowId, t.colId] }),
}))

// ─── API Tokens ───────────────────────────────────────────────────────────────
export const apiTokens = pgTable('api_tokens', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  tokenHash:   text('token_hash').notNull().unique(),
  role:        text('role').notNull(),
  lastUsedAt:  timestamp('last_used_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt:   timestamp('expires_at', { withTimezone: true }),
})

// ─── Collab Documents ─────────────────────────────────────────────────────────
export const collabDocuments = collabSchema.table('documents', {
  sheetId:       uuid('sheet_id').primaryKey().references(() => sheets.id, { onDelete: 'cascade' }),
  ydocBinary:    customType<{ data: Buffer }>({ dataType: () => 'bytea' })('ydoc_binary').notNull(),
  version:       bigint('version', { mode: 'number' }).notNull().default(0),
  lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Discussions ──────────────────────────────────────────────────────────────
export const discussions = pgTable('discussions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  sheetId:     uuid('sheet_id').notNull().references(() => sheets.id, { onDelete: 'cascade' }),
  title:       text('title'),
  authorId:    uuid('author_id').notNull().references(() => users.id),
  body:        text('body').notNull(),
  resolved:    boolean('resolved').notNull().default(false),
  resolvedBy:  uuid('resolved_by'),
  resolvedAt:  timestamp('resolved_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:   timestamp('deleted_at', { withTimezone: true }),
})

export const discussionComments = pgTable('discussion_comments', {
  id:           uuid('id').primaryKey().defaultRandom(),
  discussionId: uuid('discussion_id').notNull().references(() => discussions.id, { onDelete: 'cascade' }),
  authorId:     uuid('author_id').notNull().references(() => users.id),
  body:         text('body').notNull(),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:    timestamp('deleted_at', { withTimezone: true }),
})

// ─── Export Jobs ──────────────────────────────────────────────────────────────
export const exportJobs = pgTable('export_jobs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  workspaceId:  uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  sheetId:      uuid('sheet_id').notNull().references(() => sheets.id, { onDelete: 'cascade' }),
  requestedBy:  uuid('requested_by').notNull().references(() => users.id),
  format:       text('format').notNull(),
  status:       text('status').notNull().default('queued'),
  rowCount:     integer('row_count'),
  s3Key:        text('s3_key'),
  downloadUrl:  text('download_url'),
  errorMessage: text('error_message'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt:    timestamp('expires_at', { withTimezone: true }),
})

// ─── Import Jobs ──────────────────────────────────────────────────────────────
export const importJobs = pgTable('import_jobs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  workspaceId:  uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  sheetId:      uuid('sheet_id').references(() => sheets.id, { onDelete: 'set null' }),
  requestedBy:  uuid('requested_by').notNull().references(() => users.id),
  format:       text('format').notNull(),
  originalName: text('original_name').notNull(),
  s3Key:        text('s3_key').notNull(),
  status:       text('status').notNull().default('queued'),
  rowsImported: integer('rows_imported').default(0),
  rowsFailed:   integer('rows_failed').default(0),
  errorMessage: text('error_message'),
  rowErrors:    jsonb('row_errors'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Webhook Deliveries ───────────────────────────────────────────────────────
export const webhookDeliveries = pgTable('webhook_deliveries', {
  id:           uuid('id').primaryKey().defaultRandom(),
  webhookId:    uuid('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
  workspaceId:  uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  eventType:    text('event_type').notNull(),
  payload:      jsonb('payload').notNull(),
  attempt:      integer('attempt').notNull().default(1),
  status:       text('status').notNull().default('pending'),
  httpStatus:   integer('http_status'),
  responseBody: text('response_body'),
  durationMs:   integer('duration_ms'),
  errorMessage: text('error_message'),
  deliveredAt:  timestamp('delivered_at', { withTimezone: true }),
  nextRetryAt:  timestamp('next_retry_at', { withTimezone: true }),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Webhooks ─────────────────────────────────────────────────────────────────
export const webhooks = pgTable('webhooks', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  url:         text('url').notNull(),
  secret:      text('secret').notNull(),
  events:      text('events').array().notNull().default([]),
  enabled:     boolean('enabled').notNull().default(true),
  createdBy:   uuid('created_by').notNull().references(() => users.id),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastFiredAt: timestamp('last_fired_at', { withTimezone: true }),
})
