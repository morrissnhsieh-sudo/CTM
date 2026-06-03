# CLAUDE.md - Collaborative AI Spreadsheet System

This file is the **single source of truth** for developing the CTM platform. It contains the architecture, tech stack, build commands, coding patterns, and workflow guidelines.

---

## 1. System Overview & Architecture

**CTM** is a real-time, cloud-native collaborative spreadsheet platform with AI-augmented data management, built on a microservices architecture.

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Frontend (Next.js 15)                       │
│  - Real-time grid UI with TanStack Table + Canvas rendering        │
│  - next-auth v5 with JWT CredentialsProvider                       │
│  - WebSocket client for presence & live cell updates               │
│  - TailwindCSS + shadcn/ui component library                       │
└────────────────────┬────────────────────────────────────────────────┘
                     │ HTTP + WebSocket over nginx
┌────────────────────▼──────────────────────────────────────────────────┐
│                       API Gateway (nginx + Docker)                     │
│  - TLS termination, rate limiting, reverse proxy to microservices  │
└──────────────┬──────────────┬──────────────┬──────────────┬───────────┘
               │              │              │              │
     ┌─────────▼─────┐  ┌────▼────────┐  ┌─▼──────────┐  ┌──▼────────┐
     │  API Service  │  │ Collab      │  │ Messaging  │  │ PM        │
     │  (Fastify)    │  │ Service     │  │ Service    │  │ Service   │
     │  - Auth       │  │ (Node.js)   │  │ (Node.js)  │  │ (Go)      │
     │  - Sheets     │  │ - CRDTs     │  │ - Chat     │  │ - Status  │
     │  - Formulas   │  │ - Presence  │  │ - Comments │  │ - Approval│
     │  - Rows/Cols  │  │ - WebSocket │  │ - Notify   │  │ - Triggers│
     │  - MCP Server │  │            │  │            │  │           │
     └────┬──────────┘  └────┬───────┘  └─┬──────────┘  └──┬────────┘
          │                   │             │               │
    ┌─────▼─────────────────────▼────┬────▼──────────┬────▼─────────┐
    │         PostgreSQL 16          │    Redis       │    Kafka     │
    │  - Workspaces                  │  - Caching     │  - Events    │
    │  - Users & Auth                │  - Pub/Sub     │  - Streaming │
    │  - Sheets, Rows, Columns       │  - Presence    │  - Changelog │
    │  - Cells (MVCC)                │  - Rate Limit  │              │
    │  - Comments, Discussions       │                │              │
    │  - pgvector for AI embedding   │                │              │
    │  - RLS policies for security   │                │              │
    └────────────────────────────────┴────────────────┴──────────────┘
                                      │
                            ┌─────────▼────────┐
                            │   AI Service     │
                            │   (Python)       │
                            │ - LLM calls      │
                            │ - Agents         │
                            │ - RAG/indexing   │
                            │ - Formula hints  │
                            └──────────────────┘
```

**Key Integration Points:**
- **Frontend ↔ API**: HTTP + WebSocket (JWT auth in Authorization header)
- **API ↔ Collab**: Internal Node.js over Docker network (port 3002)
- **API ↔ Messaging**: Kafka topics + HTTP webhooks
- **Collab ↔ Users**: Presence tracking via Redis pub/sub
- **All Services ↔ Database**: Drizzle ORM with RLS policies for multi-tenancy
- **Services ↔ AI**: HTTP proxy calls to Python AI service (port 5000)

---

## 2. Project Structure

```
CTM/
  CLAUDE.md                 # This file — development contract for Claude
  
  apps/
    api-service/           # M1: REST API (Fastify, TypeScript)
      src/
        app.ts             # App factory, plugin registration, error handler
        env.ts             # Environment validation (Zod)
        index.ts           # Entry point
        db/
          schema.ts        # Drizzle ORM schema (13 tables, RLS)
          helpers.ts       # Query builders, RLS context injection
        formula/
          engine.ts        # HyperFormula in-process engine, AI functions
        mcp/
          router.ts        # Model Context Protocol (MCP) server
        plugins/
          auth.ts          # JWT + PAT + mTLS auth plugin
          db.ts            # Drizzle ORM plugin (primary + replica)
          redis.ts         # Redis client + cache patterns
          kafka.ts         # Kafka producer for events
          rateLimit.ts     # Rate limiting middleware
        routes/
          auth.ts          # POST /auth/login, POST /auth/register
          workspaces.ts    # CRUD workspaces (M1.1)
          sheets.ts        # CRUD sheets (M1.2)
          columns.ts       # CRUD columns (M1.3)
          rows.ts          # CRUD rows (M1.4)
          cells.ts         # Cell updates, formulas (M4)
          copy.ts          # Sheet copy operation
          discussions.ts   # Cell-level discussions (M2.1)
          export.ts        # Export to CSV/XLSX (M10)
          import.ts        # Import from CSV/XLSX
          users.ts         # User management in workspace
          webhooks.ts      # Outbound webhooks
          ai.ts            # AI-assisted features
          pm.ts            # Project management queries
          search.ts        # Full-text search
        middleware/        # Custom middleware (logging, tracing)
        services/          # Business logic (auth, export, search)
    
    collab-service/        # M2: Real-time Collab (Node.js + Yjs/Automerge)
      src/
        index.ts           # WebSocket server entry
        server.ts          # Fastify server with WebSocket plugin
        persistence.ts     # CRDT state to PostgreSQL
        presence.ts        # User presence tracking via Redis
        kafka.ts           # Subscribe to cell events
        logger.ts          # Structured logging
    
    messaging-service/     # M7: Chat & Notifications
      src/
        index.ts           # WebSocket + HTTP endpoints
        routes/
          chat.ts          # Pub/Sub chat rooms
          comments.ts      # Cell-level comments
          notifications.ts # User notifications
    
    pm-service/            # M5: Project Management (Go)
      cmd/
        main.go            # Server entry
      internal/
        handlers/          # HTTP handlers
        models/            # Data models
        store/             # Database queries
        triggers/          # Workflow triggers
      proto/               # Protobuf definitions
    
    ai-service/            # M6: AI & LLM (Python, FastAPI)
      src/
        main.py            # FastAPI app
        llm_client.py      # OpenAI/Claude client
        agents/            # LangGraph agent definitions
        tools/             # Tool functions for agents
        rag/               # Retrieval-augmented generation
        guards/            # Prompt guards & validation
        routes/            # API endpoints
        db.py              # SQLAlchemy ORM
        config.py          # Settings (Pydantic)
    
    frontend/              # M1 UI: Next.js 15
      src/
        app/               # App router (layout, pages)
        components/        # React components
          ui/              # shadcn/ui exports
          grid/            # Spreadsheet grid component
          chat/            # Chat UI
          sidebar/         # Navigation
        middleware.ts      # next-auth middleware
      next.config.ts       # Next.js config
  
  packages/
    shared-types/          # TypeScript types (Monorepo package)
      src/
        index.ts           # Main type exports
        schema.ts          # Data model types
        api.ts             # API request/response types
    
    kafka-schemas/         # Kafka event schemas (TypeScript + Protobuf)
      src/
        events.ts          # Typed event definitions
  
  infra/
    k8s/                   # Kubernetes manifests (prod deployment)
      api.yaml
      postgres.yaml
      redis.yaml
      kafka.yaml
    
    postgres/              # PostgreSQL config & migrations
      migrations/          # Drizzle ORM migrations
      postgresql.conf      # Performance tuning
      postgresql.prod.conf # Production config
    
    redis/
      redis.conf           # Cache + pub/sub config
    
    kafka/
      docker-compose.yml   # Local Kafka stack
    
    keycloak/              # Auth service (deprecated, now local JWT)
      realm-export.json
  
  deploy/
    docker-compose.prod.yml  # Production orchestration
    nginx/
      nginx.conf           # TLS, rate limiting, CORS
      conf.d/
        api.conf           # Upstream routing
    scripts/
      deploy.sh            # Deployment automation
      setup-secrets.sh     # Secrets management
      setup-server.sh      # Initial server setup
  
  testing/                 # E2E & integration tests
    playwright.config.ts   # E2E browser automation
    vitest.config.ts       # Unit test runner
    m1-frontend/
      e2e/
      unit/
    m2-collab/
      integration/
      unit/
    m3-api/
      integration/
      unit/
    m5-pm/                 # Go tests
    m6-ai/                 # Python pytest tests
  
  docs/
    architecture/          # System design docs
      01-COLLAB.md         # CRDT collaboration model
      02-AUTH.md           # JWT + multi-tenant security
      03-FORMULA.md        # Formula engine & AI integration
      ADRs/                # Architecture decision records
    
    specs/                 # Feature specifications
      SPEC-001-sheets.md
      SPEC-002-formulas.md
    
    study/                 # Research & benchmarks
      Architecture_A_vs_C_Comparison.html

  docker-compose.yml       # Local development stack
  start_all.ps1            # PowerShell: start all services
  stop_all.ps1             # PowerShell: stop all services
  pnpm-workspace.yaml      # Monorepo root config
  turbo.json               # Turbo build orchestration
  tsconfig.base.json       # Root TypeScript config
  package.json             # Root dependencies
  README.md                # Project overview
```

---

## 3. Core Tech Stack

### Frontend
- **Framework**: Next.js 15 (App Router) + React 18
- **Auth**: next-auth v5 (beta) with CredentialsProvider (local JWT)
- **Styling**: TailwindCSS v4 + shadcn/ui components
- **Grid UI**: TanStack Table v8 + Canvas rendering (future)
- **State Management**: React Server Components + client React hooks
- **Real-time**: Socket.IO or native WebSocket client
- **HTTP Client**: `fetch` (native) or Axios
- **Type Safety**: TypeScript 5.x

### Backend API
- **Runtime**: Node.js 22 LTS
- **Framework**: Fastify 5.x with plugins
- **ORM**: Drizzle ORM v0.x (type-safe SQL builder)
- **Database Driver**: node-postgres (pg)
- **Auth**: 
  - JWT (HS256, 2-hour expiration)
  - Personal Access Tokens (PAT)
  - mTLS for service-to-service
- **Formula Engine**: HyperFormula v2.6.0 (in-process)
- **Serialization**: JSON over HTTP + WebSocket
- **Model Context Protocol**: MCP SDK for AI tool exposure

### Collaboration Service
- **WebSocket**: Socket.IO or ws
- **CRDT**: Yjs or Automerge for operational transformation
- **Persistence**: PostgreSQL + Redis
- **State Sync**: Kafka topics for changelog

### Messaging Service
- **WebSocket**: Socket.IO for real-time chat
- **Pub/Sub**: Redis channels
- **Persistence**: PostgreSQL for history

### Project Management Service
- **Language**: Go 1.21+
- **Framework**: Fiber or gin-gonic
- **DB**: PostgreSQL + Drizzle ORM (Go version: sqlc)
- **Workflow**: Custom trigger engine

### AI Service
- **Language**: Python 3.11+
- **Framework**: FastAPI + Uvicorn
- **LLM**: OpenAI API or Anthropic Claude
- **Orchestration**: LangGraph (multi-step agents)
- **Embeddings**: sentence-transformers for RAG
- **ORM**: SQLAlchemy v2.x
- **Validation**: Pydantic v2.x

### Database
- **Primary**: PostgreSQL 16 with pgvector extension (embeddings)
- **Replication**: Read replicas (optional, configured via env)
- **Caching**: Redis 7.x (both cache-aside and write-through patterns)
- **Message Queue**: Apache Kafka (3.x) for event streaming
- **Object Storage**: MinIO (S3-compatible) for file exports

### Infrastructure
- **Container Runtime**: Docker 24+ + Docker Compose
- **Orchestration**: Kubernetes (prod), Docker Compose (dev)
- **Reverse Proxy**: nginx (TLS, rate limiting, compression)
- **SSL/TLS**: Let's Encrypt (prod), self-signed (dev)
- **Package Manager**: pnpm 9.x (monorepo)
- **Build Orchestration**: Turbo v2.x
- **Monitoring**: Structured JSON logging (future: Datadog/New Relic)

---

## 4. Build, Test, and Run Commands

### Prerequisites
```powershell
# Install Node.js 22 LTS, Go 1.21+, Python 3.11+
node --version      # v22.x.x
pnpm --version      # 9.x.x
go version          # go1.21+
python --version    # 3.11+

# Install Docker & Docker Compose
docker --version
docker compose version
```

### Local Development Setup

```powershell
# 1. Install all dependencies (monorepo)
pnpm install

# 2. Build shared packages
pnpm -F @ctm/shared-types build
pnpm -F @ctm/kafka-schemas build

# 3. Copy environment files
Copy-Item .env.example .env
# Edit .env to set: JWT_SECRET, DB_PASSWORD, OPENAI_API_KEY, etc.

# 4. Start infrastructure (Postgres, Redis, Kafka, MinIO, nginx)
docker compose up -d

# 5. Run database migrations
pnpm -C apps/api-service migrate

# 6. Start all microservices (separate terminals or use start_all.ps1)
pnpm --parallel dev
```

### Build Commands

```powershell
# Build all apps (uses Turbo caching)
pnpm build

# Build a single app
pnpm -C apps/api-service build
pnpm -C apps/collab-service build
pnpm -C apps/messaging-service build
pnpm -C apps/ai-service build

# Build frontend only
pnpm -C apps/frontend build

# Build Docker images for all services
docker compose build

# Build specific service image
docker compose build api-service
docker compose build collab-service
docker compose build ai-service

# Production build with multi-stage
docker compose -f deploy/docker-compose.prod.yml build
```

### Development Servers

```powershell
# Start all services in development mode (hot reload)
pnpm --parallel dev

# Or start each in a separate terminal:
pnpm -C apps/frontend dev                 # Next.js on :3000
pnpm -C apps/api-service dev              # Fastify on :3001
pnpm -C apps/collab-service dev           # WebSocket on :3002
pnpm -C apps/messaging-service dev        # WebSocket on :3003
pnpm -C apps/pm-service dev               # Go on :3004
cd apps/ai-service; python main.py        # FastAPI on :5000

# Or use the PowerShell helper
.\start_all.ps1                            # Starts all services
.\stop_all.ps1                             # Stops all services
```

### Testing

```powershell
# Run all tests (unit + integration)
pnpm test

# Run tests for a specific module
pnpm -C testing m1-frontend test:unit
pnpm -C testing m3-api test:integration
pnpm -C testing m6-ai test

# Run E2E tests with Playwright
pnpm -C testing test:e2e

# Run specific test file
pnpm -C testing m1-frontend test -- grid.spec.ts

# Watch mode (re-run on file change)
pnpm -C testing m3-api test:watch

# Python tests (AI service)
cd apps/ai-service
pytest tests/ -v

# Go tests (PM service)
cd apps/pm-service
go test ./...
```

### Linting & Formatting

```powershell
# Lint all TypeScript files
pnpm lint

# Format all files (Prettier)
pnpm format

# Fix lint errors automatically
pnpm lint:fix

# Type check without building
pnpm typecheck

# Check specific app
pnpm -C apps/api-service lint
```

### Database Migrations

```powershell
# Generate migration after schema changes
pnpm -C apps/api-service generate-migration

# Run pending migrations (dev)
pnpm -C apps/api-service migrate

# Rollback last migration
pnpm -C apps/api-service rollback

# View migration status
pnpm -C apps/api-service migration:status
```

### Docker Compose Operations

```powershell
# Start local development stack (infrastructure only)
docker compose up -d

# Stop all containers
docker compose down

# View logs for all services
docker compose logs -f

# View logs for specific service
docker compose logs -f api-service

# Rebuild images and restart
docker compose up -d --build

# Remove volumes (WARNING: deletes all data)
docker compose down -v

# Clean up unused images/containers
docker system prune -a
```

### Production Deployment

```powershell
# Build production images
docker compose -f deploy/docker-compose.prod.yml build

# Deploy to Kubernetes
kubectl apply -f infra/k8s/

# Check pod status
kubectl get pods -A

# View logs from pod
kubectl logs -f deployment/api-service

# Scale service
kubectl scale deployment api-service --replicas=3

# Apply secrets
pnpm exec ts-node deploy/scripts/setup-secrets.sh
```

---

## 5. Code & Architecture Guidelines

### 5.1 State Management & Real-Time Sync

**Cell Updates (MVCC Pattern):**
- Each cell has `(rowId, colId)` composite primary key
- Updates are versioned with `updatedAt` timestamp + `updatedBy` userId
- Concurrent edits via CRDT (Yjs) in collab-service, persisted to PostgreSQL
- **Formula Evaluation**: HyperFormula in-process, triggers async AI if formula uses `AI.*` functions

**Presence & Awareness:**
- Track active users per sheet via Redis pub/sub
- Collab service broadcasts position + cursor color to WebSocket clients
- TTL on presence keys (30s, refresh on activity) prevents stale data

**Conflict Resolution:**
- Last-write-wins (LWW) for non-conflicting fields
- CRDT for collaborative cell content
- Operational Transform for formula expressions

### 5.2 Authentication & Authorization

**Token Flow:**
1. User logs in via `/v1/auth/login` (email + password)
2. API signs JWT with `workspace_id`, `user_id`, `roles` claims
3. Client stores JWT in secure httpOnly cookie (next-auth)
4. All requests include JWT in `Authorization: Bearer <token>` header
5. API verifies signature using `JWT_SECRET` env var

**Authorization Checks:**
- **RLS (Row-Level Security)**: PostgreSQL policies check `session.user_id` + `session.workspace_id`
- **API-level**: Fastify preHandler hook validates JWT, injects `request.ctx` (RequestContext)
- **Roles**: `OWNER`, `EDITOR`, `COMMENTER`, `VIEWER` (hierarchical permissions)

**Service-to-Service Auth:**
- Personal Access Tokens (PAT) for headless clients
- mTLS certificates for internal Kubernetes pods
- Kafka messages include `X-Workspace-Id` + `X-User-Id` headers

### 5.3 Error Handling

**API Error Format:**
```typescript
{
  error: {
    code: 'VALIDATION_ERROR',      // Machine-readable code
    message: 'Invalid email',      // Human-readable message
    requestId: 'req-12345',        // For tracing
    details?: { field: 'email' }   // Optional context
  }
}
```

**HTTP Status Codes:**
- `200 OK` — Success
- `201 Created` — Resource created
- `204 No Content` — Deleted
- `400 Bad Request` — Validation error
- `401 Unauthorized` — Missing/invalid JWT
- `403 Forbidden` — Insufficient permissions
- `404 Not Found` — Resource not found
- `409 Conflict` — Duplicate key or version mismatch
- `429 Too Many Requests` — Rate limited
- `500 Internal Server Error` — Unhandled error

**WebSocket Disconnection Recovery:**
- Client reconnects with exponential backoff (1s, 2s, 4s, 8s, 30s)
- Server replays CRDT state snapshot on reconnect
- Presence keys auto-expire (30s TTL)

### 5.4 Component & Directory Conventions

**TypeScript File Naming:**
- Services: `{entity}.service.ts`
- Route handlers: `{plural}.ts` (e.g., `cells.ts`, `rows.ts`)
- Types: `{entity}.types.ts` or inline in `shared-types/`
- Utilities: `{name}.util.ts`
- Plugins: `{name}.ts` (no "plugin" suffix)

**React Component Naming:**
- Functional components: PascalCase (e.g., `GridCell.tsx`)
- UI components: `components/ui/{name}.tsx`
- Feature components: `components/{feature}/{name}.tsx`
- Props interfaces: `{ComponentName}Props`

**Database Schema Conventions:**
- Table names: `snake_case`, plural (e.g., `sheets`, `columns`)
- Column names: `snake_case` (e.g., `created_at`, `updated_by`)
- Foreign keys: `{entity}_id` (e.g., `sheet_id`, `user_id`)
- Boolean columns: prefix with `is_` or `has_`
- Composite PKs: ordered by logical dependency

**Drizzle ORM Patterns:**
```typescript
// Insert with explicit ID (no .defaultRandom())
await db.insert(sheets).values({
  id: uuid(),
  workspaceId: ctx.workspaceId,
  title: 'New Sheet',
  createdBy: ctx.userId,
})

// Update with SET clause
await db.update(sheets)
  .set({ title: 'Updated', updatedAt: new Date() })
  .where(eq(sheets.id, sheetId))

// Query with RLS context
const rows = await withRls(db, request, async (tx) => {
  return tx.select().from(sheets)
    .where(eq(sheets.workspaceId, ctx.workspaceId))
})

// Upsert pattern
await db.insert(cells).values({ rowId, colId, value })
  .onConflictDoUpdate({
    target: [cells.rowId, cells.colId],
    set: { value, updatedAt: new Date() },
  })
```

**Validation Patterns:**
```typescript
// Zod for request bodies
const CreateSheetSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
})

// Type inference for safety
type CreateSheetRequest = z.infer<typeof CreateSheetSchema>

// Fastify route with Zod
app.post('/sheets', {
  schema: { body: CreateSheetSchema },
  handler: async (request, reply) => {
    const body = request.body // Typed as CreateSheetRequest
  }
})
```

### 5.5 LLM Interface Security

**Prompt Injection Prevention:**
- **Input Validation**: Sanitize user formulas with HyperFormula parser
- **Output Escaping**: JSON.stringify all LLM responses before sending to client
- **Allowlist Functions**: Only enable specific AI functions (`AI.QUERY`, `AI.CLASSIFY`, etc.)
- **Timeout Protection**: LLM calls timeout after 30s to prevent hanging formulas

**Data Privacy:**
- Never send raw cell data to LLM without explicit consent
- Aggregate/anonymize data before RAG indexing
- Token limit: max 4K context tokens for formula assistance
- Log LLM interactions for audit trail

**Sandboxing LLM-Generated Code:**
- Formulas are evaluated by HyperFormula (safe sandbox)
- Workflow triggers are pre-approved by OWNER before execution
- No direct code evaluation; only safe DSL (SQL-like formula syntax)

**API Rate Limiting:**
- AI calls: 100 req/min per user (via Redis rate limiter)
- LLM fallback to free tier if quota exceeded
- Exponential backoff for OpenAI API errors

### 5.6 Database Transaction Patterns

**Drizzle Transaction Usage:**
```typescript
const result = await db.transaction(async (tx) => {
  // All queries in tx are isolated; rolled back on error
  const workspace = await tx.insert(workspaces).values({...}).returning()
  await tx.insert(users).values({...})
  return workspace
})

// Transaction with RLS:
const rows = await withRls(db, request, async (tx) => {
  // tx is Drizzle client with RLS context pre-injected
  return tx.select().from(sheets)
})
```

**ACID Guarantees:**
- Read Committed isolation level (PostgreSQL default)
- Serializable for critical multi-step operations (e.g., approval chain)
- Deadlock handling: exponential retry on serialization conflict

---

## 6. Typical Workflow Patterns (How-To)

### 6.1 Add a New Spreadsheet Formula Function

**Goal**: Add a new formula like `TEXT_ANALYZE(range)` to detect sentiment

**Steps:**

1. **Define the AI function in HyperFormula plugin** (`apps/api-service/src/formula/engine.ts`):
   ```typescript
   const CTMPlugin = {
     implementedFunctions: {
       'TEXT_ANALYZE': { method: 'textAnalyze' },
     },
     textAnalyze: (args: any[], formulaArg: any) => {
       // Return LOADING_SENTINEL; actual computation happens async
       return LOADING_SENTINEL
     },
   }
   ```

2. **Add to AI function allowlist** (`engine.ts`):
   ```typescript
   const AI_FUNCTION_NAMES = [..., 'TEXT_ANALYZE']
   ```

3. **Create AI route handler** (`apps/api-service/src/routes/ai.ts`):
   ```typescript
   app.post('/ai/analyze-text', async (request, reply) => {
     const { cellRange, text } = request.body
     const result = await app.llm.analyzeText(text) // Call LLM
     // Broadcast result back to formula engine
     await app.kafka.publish('formula-results', {
       cellRef: cellRange,
       result,
     })
   })
   ```

4. **Emit event from formula engine when AI function detected** (`engine.ts`):
   ```typescript
   if (isAiFormula) {
     void this.callbacks.onAiFormulaRequested({
       formula: rawValue,
       cellRef: `r${rowId}c${colId}`,
       sheetId,
     })
   }
   ```

5. **Subscribe in API service** (`src/plugins/kafka.ts`):
   ```typescript
   await app.kafka.subscribe('formula-results', async (msg) => {
     const { cellRef, result } = msg
     // Update cell with LLM result
     await app.db.update(cells).set({ value: result }).where(...)
   })
   ```

6. **Test**:
   ```powershell
   # Add unit test
   pnpm -C testing m4-formula test -- "TEXT_ANALYZE formula"
   
   # Manual test: enter formula =TEXT_ANALYZE(A1:A5) in a cell
   # Verify cell shows #LOADING... initially, then updates with sentiment
   ```

---

### 6.2 Create a New Automated Workflow Trigger

**Goal**: Auto-approve rows that pass budget threshold

**Steps:**

1. **Define trigger in PM service** (`apps/pm-service/internal/triggers/budget.go`):
   ```go
   type BudgetApprovalTrigger struct {
     ThresholdAmount int
     ApproverId      string
   }
   
   func (t *BudgetApprovalTrigger) Evaluate(row Row) bool {
     return row.BudgetValue > t.ThresholdAmount
   }
   ```

2. **Add trigger creation endpoint** (`apps/pm-service/internal/handlers/triggers.go`):
   ```go
   func (h *Handler) CreateTrigger(w http.ResponseWriter, r *http.Request) {
     trigger := BudgetApprovalTrigger{...}
     err := h.store.SaveTrigger(trigger)
     json.NewEncoder(w).Encode(trigger)
   }
   ```

3. **Register trigger in workflow engine** (`apps/pm-service/internal/workflow/engine.go`):
   ```go
   engine.RegisterTrigger("budget-approval", &BudgetApprovalTrigger{})
   ```

4. **Subscribe to row events** (`apps/pm-service/internal/kafka/subscriber.go`):
   ```go
   func (s *Subscriber) OnRowCreated(ctx context.Context, row Row) {
     if trigger.Evaluate(row) {
       s.approvalService.AutoApprove(row.ID)
     }
   }
   ```

5. **Expose trigger management in API** (`apps/api-service/src/routes/pm.ts`):
   ```typescript
   app.post('/projects/:id/triggers', async (request, reply) => {
     const result = await fetch(`${PM_SERVICE_URL}/triggers`, {
       method: 'POST',
       body: JSON.stringify(request.body),
     })
     reply.send(await result.json())
   })
   ```

6. **Test**:
   ```powershell
   # Create trigger via API
   curl -X POST http://localhost:3001/v1/projects/proj-123/triggers \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"type":"budget-approval","thresholdAmount":10000}'
   
   # Insert row that meets threshold
   # Verify row auto-approves within 1s
   ```

---

### 6.3 Expand the LLM's Tool-Calling Capabilities

**Goal**: Enable Claude to call CTM APIs directly (e.g., "analyze this sheet for anomalies")

**Steps:**

1. **Create MCP tools** (`apps/api-service/src/mcp/router.ts`):
   ```typescript
   server.tool(
     'analyze-sheet',
     'Analyze sheet data for anomalies using AI',
     { sheetId: z.string() },
     async ({ sheetId }) => {
       const data = await getSheetData(sheetId)
       // LLM (via MCP client) receives data and can call this tool
       return { content: [{ type: 'text', text: JSON.stringify(data) }] }
     },
   )
   ```

2. **Register tool with MCP server**:
   ```typescript
   export const mcpRouter: FastifyPluginAsync = async (app) => {
     app.post('/message', async (request, reply) => {
       const server = new McpServer({...})
       server.tool('analyze-sheet', ...)
       // server.listTools() returns all tools
     })
   }
   ```

3. **Expose MCP endpoint** (`apps/api-service/src/app.ts`):
   ```typescript
   await app.register(mcpRouter, { prefix: '/mcp' })
   // POST /mcp/message to invoke tools
   ```

4. **Test with Claude (Cursor/Claude.dev)**:
   ```
   Configure MCP server URL: http://localhost:3001/mcp
   Ask Claude: "Analyze the sheet for anomalies"
   Claude will call analyze-sheet tool, receive data, and provide insights
   ```

5. **Add more tools as needed**:
   - `read_sheet`: Get schema + metadata
   - `read_rows`: Paginated row data
   - `update_cell`: Modify cell value
   - `insert_row`: Add new row
   - `query_data_nl`: Natural language query (proxies to AI service)

---

### 6.4 Deploy to Production

**Prerequisites:**
- AWS/GCP/Azure account with container registry (ACR, ECR, GCR)
- Kubernetes cluster (1.27+)
- SSL certificate (Let's Encrypt)
- PostgreSQL managed database
- Redis managed cache
- Kafka cluster

**Steps:**

1. **Prepare environment**:
   ```powershell
   # Create .env.prod with production secrets
   cp .env.example .env.prod
   # Edit .env.prod: DB_HOST, DB_PASSWORD, JWT_SECRET, OPENAI_API_KEY
   ```

2. **Build & push Docker images**:
   ```powershell
   docker compose -f deploy/docker-compose.prod.yml build
   docker tag ctm-api-service:latest myregistry.azurecr.io/ctm-api:v1.0.0
   docker push myregistry.azurecr.io/ctm-api:v1.0.0
   # Repeat for all services
   ```

3. **Deploy to Kubernetes**:
   ```powershell
   kubectl apply -f infra/k8s/namespace.yaml
   kubectl apply -f infra/k8s/secrets.yaml
   kubectl apply -f infra/k8s/api.yaml
   kubectl apply -f infra/k8s/collab.yaml
   kubectl apply -f infra/k8s/postgres.yaml
   ```

4. **Configure ingress (TLS + rate limiting)**:
   ```yaml
   apiVersion: networking.k8s.io/v1
   kind: Ingress
   metadata:
     name: ctm-ingress
     annotations:
       cert-manager.io/cluster-issuer: letsencrypt-prod
   spec:
     tls:
     - hosts:
       - spreadsheet.example.com
         secretName: ctm-tls
     rules:
     - host: spreadsheet.example.com
       http:
         paths:
         - path: /
           pathType: Prefix
           backend:
             service:
               name: api-service
               port: { number: 3001 }
   ```

5. **Verify deployment**:
   ```powershell
   kubectl get pods -n ctm
   kubectl logs -f deployment/api-service -n ctm
   kubectl describe svc api-service -n ctm
   
   # Test endpoint
   curl https://spreadsheet.example.com/v1/health
   ```

6. **Enable monitoring**:
   ```powershell
   # Install Prometheus + Grafana
   helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
   helm install prometheus prometheus-community/kube-prometheus-stack
   
   # Configure service monitors
   kubectl apply -f infra/k8s/monitoring/
   ```

7. **Setup CI/CD pipeline** (GitHub Actions example):
   ```yaml
   name: Deploy to Production
   on:
     push:
       branches: [main]
   jobs:
     deploy:
       runs-on: ubuntu-latest
       steps:
       - uses: actions/checkout@v3
       - run: docker build -t myregistry.azurecr.io/ctm-api:${{ github.sha }} apps/api-service
       - run: docker push myregistry.azurecr.io/ctm-api:${{ github.sha }}
       - run: |
           kubectl set image deployment/api-service \
             api=myregistry.azurecr.io/ctm-api:${{ github.sha }} \
             -n ctm
   ```

---

## 7. Environment Variables

### Required (.env)

```
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ctm
DB_USER=postgres
DB_PASSWORD=<strong-password>
DB_REPLICA_HOST=localhost  # Optional read replica
DB_SSL=false               # true in production

# Redis
REDIS_URL=redis://localhost:6379

# Kafka
KAFKA_BROKERS=localhost:9092

# Auth
JWT_SECRET=<64-char-random-string>
JWT_EXPIRY_HOURS=2
PASSWORD_SCRYPT_N=16384

# AI/LLM
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
AI_SERVICE_URL=http://localhost:5000
LLM_MODEL=gpt-4-turbo  # or claude-3-opus

# Services
API_SERVICE_URL=http://localhost:3001
COLLAB_SERVICE_URL=http://localhost:3002
MESSAGING_SERVICE_URL=http://localhost:3003
PM_SERVICE_URL=http://localhost:3004

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3002

# Feature Flags
ENABLE_AI_FORMULAS=true
ENABLE_RAG=true
ENABLE_WEBHOOKS=true

# Security
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Storage
MINIO_URL=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

---

## 8. Key Decision Records (ADRs)

### ADR-001: Local JWT vs. Keycloak
- **Decision**: Switched to local JWT with HS256
- **Rationale**: Simplify deployment, reduce latency, faster iteration
- **Trade-off**: Manual key rotation; no built-in MFA/SAML

### ADR-002: Operational Transform vs. CRDT
- **Decision**: Yjs (CRDT) for collab service
- **Rationale**: Conflict-free merging, works offline, better UX
- **Implementation**: Persist CRDT state snapshots to PostgreSQL

### ADR-003: In-Process Formula Engine
- **Decision**: HyperFormula in-process (not separate service)
- **Rationale**: Lower latency, simpler deployment, easier debugging
- **Trade-off**: Single instance; vertical scaling only

### ADR-004: Microservices vs. Monolith
- **Decision**: Microservices (5 independent services)
- **Rationale**: Independent scaling, polyglot tech stack, fault isolation
- **Trade-off**: Eventual consistency, distributed debugging

---

## 9. Debugging Checklist

**Application won't start:**
- Check `pnpm install` completed
- Verify `.env` file exists and has required keys
- Run `docker compose up -d` for infrastructure
- Check port conflicts: `netstat -ano | findstr :3001`

**Database connection fails:**
- Verify PostgreSQL is running: `docker compose logs postgres`
- Check credentials in `.env` match `docker-compose.yml`
- Reset DB: `docker compose down -v; docker compose up -d`

**WebSocket disconnects:**
- Check collab-service logs: `docker compose logs collab-service`
- Verify Redis is running: `redis-cli ping`
- Check browser DevTools Network tab for WebSocket errors

**Formulas not evaluating:**
- Verify HyperFormula plugin is loaded
- Check browser console for formula errors
- Enable debug logs: `LOG_LEVEL=debug pnpm dev`

**AI features timeout:**
- Check `AI_SERVICE_URL` in `.env` points to running Python service
- Verify OpenAI API key is valid: `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"`
- Increase timeout: `LLM_TIMEOUT_MS=60000`

**Tests fail:**
- Clear node_modules: `pnpm clean; pnpm install`
- Rebuild shared types: `pnpm -F @ctm/shared-types build`
- Run in isolation: `pnpm -C testing m1-frontend test -- --reporter=verbose`

---

## 10. Glossary

| Term | Definition |
|------|-----------|
| CRDT | Conflict-free Replicated Data Type (Yjs, Automerge) |
| OT | Operational Transform (alternative to CRDT) |
| RLS | PostgreSQL Row-Level Security policy |
| MCP | Model Context Protocol (for LLM tool calls) |
| MVCC | Multi-Version Concurrency Control (PostgreSQL) |
| PAT | Personal Access Token (service-to-service auth) |
| LWW | Last-Write-Wins (conflict resolution) |
| HyperFormula | In-process spreadsheet formula engine |
| Drizzle | Type-safe SQL query builder for TypeScript |
| Yjs | CRDT library for shared state |
| next-auth | Authentication library for Next.js |
| Fastify | Fast Node.js web framework |
| Kafka | Distributed event streaming platform |
| pgvector | PostgreSQL vector extension (embeddings) |

---

**Document Version**: 1.0  
**Last Updated**: June 2026  
**Maintainer**: Engineering Team

---

*This CLAUDE.md is the source of truth for all CTM development. Treat this as a living document—update it as architecture evolves.*