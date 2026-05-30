# CTM — Collaborative AI Spreadsheet Platform

> A cloud-native, real-time collaborative spreadsheet and project management platform with embedded AI, built as a set of independently deployable microservices.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Module Summary](#module-summary)
- [Environment Requirements](#environment-requirements)
- [Project Structure](#project-structure)
- [Configuration & Settings](#configuration--settings)
- [Starting the Platform](#starting-the-platform)
- [Stopping the Platform](#stopping-the-platform)
- [Access Points](#access-points)
- [Default Credentials](#default-credentials)
- [Feature Guide](#feature-guide)
- [API Reference](#api-reference)
- [Development Workflow](#development-workflow)
- [Technology Stack](#technology-stack)

---

## Overview

CTM is a full-stack collaborative spreadsheet platform comparable to Airtable / Smartsheet, extended with:

- **Real-time multi-user editing** powered by Yjs CRDTs — no merge conflicts, works offline
- **Project management views** — Gantt (with CPM critical path), Kanban, Calendar, Timeline, Dashboard
- **Row-level approval workflows** with finite state machines and SLA escalation
- **Embedded AI assistant** — natural language queries (Text-to-SQL), formula generation, multi-step agents, and inline `=AI.*` cell functions
- **MCP server** so AI clients (Claude, Cursor, Codex) can read and write spreadsheet data via tool calls
- **Full messaging layer** — cell comments, workspace chat channels, email digest notifications, outbound webhooks

The system is composed of **10 microservices** that communicate via REST, gRPC, WebSocket, and Apache Kafka.

---

## System Architecture

```
Browser (M1 Next.js)
  │
  ├── WebSocket ──────────────► M2  Collaboration Engine  (Yjs CRDTs)
  │                                      │
  ├── HTTPS REST ─────────────► M3  API Gateway           (Fastify)
  │                              │      │
  │                              │      └── M4  Formula Engine (Hyperformula, in-process)
  │                              │
  │                              ├── gRPC ──► M5  PM Service       (Go)
  │                              ├── HTTP ──► M6  AI Agent Service  (Python / LangGraph)
  │                              └── HTTP ──► M7  Messaging Service (Node.js / Socket.io)
  │
  └── WebSocket ──────────────► M7  Chat & Notifications
  
  M2, M3, M5, M6, M7
       │
       └── Apache Kafka (M8)  ──► async fan-out to all consumers
  
  All services
       └── PostgreSQL 16 + pgvector  (M9)
       └── Redis 7.2                 (M9)
       └── MinIO / S3                (M9)
       └── Keycloak 24               (M10)
```

**Data flow:**
1. Cell edits travel as binary Yjs CRDT ops over WebSocket (M2) — instant, offline-capable
2. Persistent writes go through M3 REST → PostgreSQL
3. Formula recalculation runs in-process inside M3 (M4) on every cell write — p99 < 100 ms for 10k dependent cells
4. Domain events are published to Kafka (M8) for async fan-out to M4 (recalc), M5 (triggers), M6 (RAG indexing), M7 (notifications)
5. AI requests stream back as Server-Sent Events (SSE) from M6 through M3 to the browser

---

## Module Summary

| # | Service | Language | Responsibility |
|---|---------|----------|----------------|
| M1 | `frontend` | Next.js 15, TypeScript | SPA shell, Canvas grid renderer (60 fps, 500k rows), PM views, AI panel |
| M2 | `collab-service` | Node.js, TypeScript | Yjs CRDT sync, Hocuspocus WebSocket, presence, offline queue |
| M3 | `api-service` | Node.js, TypeScript (Fastify) | REST API gateway, auth middleware, rate limiting, MCP server |
| M4 | `formula-service` | TypeScript (Hyperformula) | Formula engine — DAG recalc, `=AI.*` async functions (in-process with M3) |
| M5 | `pm-service` | Go 1.22 | Gantt / CPM scheduling, approval FSMs, workflow triggers, time tracking |
| M6 | `ai-service` | Python 3.12 (FastAPI) | Text-to-SQL, Text-to-Formula, LangGraph agents, pgvector RAG pipeline |
| M7 | `messaging-service` | Node.js, TypeScript | Cell comments, workspace chat, notification dispatcher (email / webhook) |
| M8 | *(infrastructure)* | Apache Kafka 3.7 | Async event bus, 7 topics, KRaft mode (no ZooKeeper) |
| M9 | *(infrastructure)* | PostgreSQL 16, Redis 7, MinIO | Relational data, vector embeddings, cache, object storage |
| M10 | *(infrastructure)* | Keycloak 24 | OAuth 2.0 + OIDC, SSO, MFA, SCIM 2.0, RBAC |

---

## Environment Requirements

### Required software

| Tool | Minimum version | Purpose |
|------|----------------|---------|
| **Docker Desktop** | 4.28+ | Runs all 12 containers |
| **Docker Compose** | 2.24+ (bundled with Docker Desktop) | Orchestrates services |
| PowerShell | 5.1+ (built into Windows) | Start / stop scripts |

> **No local Node.js, Python, or Go installation is required.** Everything runs inside Docker containers.

### Required credentials

| Credential | Where to get it | Notes |
|-----------|----------------|-------|
| **Vertex AI service account JSON** | Google Cloud Console → IAM → Service Accounts | Already present at `C:\Users\User\Code\VertexKeys\d-sxd110x-ssd1-aaos-34f80b5f4448.json` |

### Optional credentials

| Credential | Purpose |
|-----------|---------|
| `ANTHROPIC_API_KEY` | Direct Anthropic API fallback if Vertex AI is unavailable |
| `OPENAI_API_KEY` | OpenAI fallback for LLM + embeddings |
| `RESEND_API_KEY` | Transactional email notifications |

---

## Project Structure

```
CTM/
├── apps/
│   ├── frontend/              M1  Next.js 15 — Canvas grid, PM views, AI panel
│   │   ├── src/app/           App Router routes (auth, workspace, sheet pages)
│   │   ├── src/components/    Grid canvas, toolbar, view picker, AI panel
│   │   ├── src/store/         Zustand stores: gridStore, uiStore, userStore
│   │   ├── src/hooks/         useCollabProvider (Yjs ↔ Hocuspocus)
│   │   └── src/lib/           API client, utilities
│   │
│   ├── collab-service/        M2  Yjs CRDT collaboration engine
│   │   └── src/               server, persistence, presence, kafka publisher
│   │
│   ├── api-service/           M3+M4  Fastify API gateway + formula engine
│   │   ├── src/plugins/       db, redis, kafka, auth, rateLimit, swagger
│   │   ├── src/routes/        sheets, rows, columns, cells, workspaces, ai, pm...
│   │   ├── src/formula/       Hyperformula engine + Fastify plugin
│   │   ├── src/mcp/           Model Context Protocol server
│   │   └── src/db/            Drizzle ORM schema + RLS helpers
│   │
│   ├── pm-service/            M5  Go PM service
│   │   ├── cmd/pm-service/    main.go — wires all components
│   │   └── internal/
│   │       ├── cpm/           Critical Path Method algorithm
│   │       ├── approval/      Finite state machine (looplab/fsm)
│   │       ├── trigger/       Workflow trigger evaluator (go-expr)
│   │       ├── repository/    PostgreSQL repositories (pgx v5)
│   │       ├── grpc/          gRPC server + interceptors
│   │       ├── http/          Gin REST gateway
│   │       └── kafka/         Producer + consumer
│   │
│   ├── ai-service/            M6  Python AI agent service
│   │   └── src/
│   │       ├── llm_client.py  LLM factory: Vertex AI → Anthropic → OpenAI
│   │       ├── config.py      Pydantic settings
│   │       ├── guards/        5-layer security guards
│   │       ├── routes/        query (SSE), formula, agent (SSE), formula_eval
│   │       ├── agents/        LangGraph graph builder (4 agent types)
│   │       ├── rag/           pgvector embedding index + retrieval
│   │       └── kafka/         ctm.ai.jobs consumer
│   │
│   └── messaging-service/     M7  Node.js messaging
│       └── src/
│           ├── socket/        Socket.io handler — rooms, presence, heartbeat
│           ├── routes/        comments, messages, channels, notifications
│           ├── notifications/ dispatcher — in-app, email (Resend), webhooks
│           └── kafka/         ctm.approvals, ctm.workflows consumer
│
├── packages/
│   └── shared-types/          TypeScript domain types shared across all TS services
│       └── src/               workspace, user, sheet, cell, column, row, auth,
│                              events, api, pm, ai, messaging
│
├── infra/
│   ├── postgres/
│   │   ├── migrations/        001_core_schema.sql → 006_rls_policies.sql
│   │   └── postgresql.conf    Tuned PostgreSQL 16 config
│   └── keycloak/
│       └── realm-export.json  CTM realm — clients, roles, demo users
│
├── docker-compose.yml         All 12 containers + named volumes + network
├── start_all.ps1              Start script (see below)
├── stop_all.ps1               Stop script (see below)
├── .env.example               Template — copy to .env before first run
├── turbo.json                 Turborepo task pipeline
├── pnpm-workspace.yaml        pnpm monorepo workspace config
└── tsconfig.base.json         Shared TypeScript base config
```

---

## Configuration & Settings

### 1. Create your `.env` file

The start script creates `.env` automatically from `.env.example` on first run. To set it up manually:

```powershell
Copy-Item .env.example .env
```

### 2. `.env` reference

```dotenv
# ── Vertex AI (primary LLM — pre-configured) ─────────────────────────────────
# Path to the Google Cloud service account JSON key
VERTEX_KEY_PATH=C:/Users/User/Code/VertexKeys/d-sxd110x-ssd1-aaos-34f80b5f4448.json

# ── Fallback LLM keys (optional) ─────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...     # direct Anthropic API (fallback)
OPENAI_API_KEY=sk-...            # OpenAI fallback for LLM + embeddings

# ── Email notifications (optional) ───────────────────────────────────────────
RESEND_API_KEY=re_...            # Resend transactional email API
```

> All other settings (database URLs, Redis, Kafka brokers, Keycloak endpoints) are hardcoded inside `docker-compose.yml` and do not need to be set in `.env` for local development.

### 3. Vertex AI LLM configuration

The AI service (`M6`) is pre-configured to use:

| Setting | Value |
|---------|-------|
| Provider | Google Cloud Vertex AI |
| Project ID | `d-sxd110x-ssd1-aaos` |
| Region | `us-east5` |
| Primary model | `claude-sonnet-4-5@20241022` |
| Agent model | `claude-opus-4-5@20240801` |
| Embedding model | `text-embedding-004` (768-dim) |
| Service account | `vertexai-prod@d-sxd110x-ssd1-aaos.iam.gserviceaccount.com` |

The key file is mounted read-only into the container at `/run/secrets/vertex_key.json` via Docker volume. Nothing sensitive is baked into the image.

**LLM fallback chain:** Vertex AI → Anthropic (if `ANTHROPIC_API_KEY` set) → raises error.

### 4. Key service ports

| Port | Service | Notes |
|------|---------|-------|
| `3000` | M1 Frontend | Next.js — main browser UI |
| `3001` | M3 API Gateway | REST API — Swagger at `/v1/docs` |
| `1234` | M2 Collab Engine | WebSocket (`wss://`) |
| `3002` | M7 Messaging | Socket.io + REST |
| `8001` | M6 AI Service | FastAPI — docs at `/docs` |
| `8085` | M5 PM Service | HTTP gateway (gRPC internally on `50051`) |
| `5432` | PostgreSQL | Primary database |
| `6379` | Redis | Cache + pub/sub |
| `9092` | Kafka | Event bus broker |
| `8080` | Keycloak | Auth server — admin at `/admin` |
| `9000` | MinIO API | S3-compatible object storage |
| `9001` | MinIO Console | Web UI |
| `8090` | Kafka UI | Topic / consumer lag monitoring |

### 5. Database credentials (local dev)

| Setting | Value |
|---------|-------|
| Host | `localhost:5432` |
| Database | `ctm` |
| Username | `ctm` |
| Password | `ctm_dev_pass` |

### 6. RBAC roles

| Role | Permissions |
|------|------------|
| `OWNER` | Full control — delete workspace, billing, transfer ownership |
| `ADMIN` | All read/write + sharing management |
| `EDITOR` | Read + write cells, rows, columns; create/delete sheets |
| `COMMENTER` | Read + add comments; cannot edit cell data |
| `VIEWER` | Read-only |

---

## Starting the Platform

### Quick start

```powershell
cd C:\Users\User\Code\CTM
.\start_all.ps1
```

The script takes approximately **2–4 minutes** on first run (image pulls), under **30 seconds** on subsequent runs.

### Start script — step by step

The script performs **9 automated steps**:

```
Step 1  Pre-flight checks        Docker Engine + Compose version; Vertex AI key presence
Step 2  Environment setup        Creates .env from .env.example if missing; injects VERTEX_KEY_PATH
Step 3  Infrastructure start     PostgreSQL, Redis, Kafka, MinIO, MinIO bucket init
Step 4  Infrastructure health    Waits for all infra containers to pass Docker health checks
Step 5  Keycloak start           Starts auth server; waits for /health/ready endpoint
Step 6  App microservices        Starts M2 → M3/M4 → M5 → M6 → M7 in dependency order
Step 7  Frontend start           Starts M1 (Next.js 15)
Step 8  App health checks        Polls each service's /health endpoint
Step 9  Status table             Prints colour-coded table of all 12 containers
```

### Start script flags

| Flag | Description |
|------|-------------|
| *(none)* | Normal start — reuse existing images and data |
| `-Rebuild` | Force `docker compose build` before starting — use after code changes |
| `-NoHealthWait` | Skip health check polling (faster start, but services may not be ready) |
| `-Detach:$false` | Stream all container logs to the console instead of running in background |

```powershell
# Rebuild all images and start
.\start_all.ps1 -Rebuild

# Start without waiting for health checks
.\start_all.ps1 -NoHealthWait

# Stream logs to console (Ctrl+C to stop)
.\start_all.ps1 -Detach:$false
```

### Status table example

When startup completes, the script prints:

```
  Service                                  Port       Status
  ──────────────────────────────────────── ────────── ──────────
  M9  PostgreSQL 16 + pgvector             5432       running ✓
  M9  Redis 7.2                            6379       running ✓
  M8  Kafka 3.7 (KRaft)                   9092       running ✓
  M8  Kafka UI                             8090       running
  M9  MinIO (S3)                           9001       running ✓
  M10 Keycloak 24                          8080       running ✓
  M2  Collaboration Engine                 1234       running
  M3+M4 API Gateway + Formulas             3001       running
  M5  PM Service (Go)                      8085       running
  M6  AI Agent Service                     8001       running
  M7  Messaging Service                    3002       running
  M1  Frontend (Next.js 15)                3000       running
```

---

## Stopping the Platform

### Quick stop (keep all data)

```powershell
.\stop_all.ps1
```

Stops all 12 containers gracefully in reverse dependency order. All database data, Kafka topics, and uploaded files are **preserved** in Docker named volumes.

### Stop script flags

| Flag | Description |
|------|-------------|
| *(none)* | Graceful stop — containers removed, data kept |
| `-Volumes` | Also delete all persistent data volumes (full data wipe) |
| `-Images` | Also remove all built CTM Docker images (forces full rebuild) |
| `-Full` | Shortcut for `-Volumes -Images` |
| `-Prune` | Run `docker system prune` after stopping (reclaims disk space) |
| `-Force` | Skip the `YES` confirmation prompt for destructive actions |

```powershell
# Stop and keep all data (normal)
.\stop_all.ps1

# Stop and wipe all data (asks for confirmation)
.\stop_all.ps1 -Volumes

# Full reset — wipe data + images, no confirmation
.\stop_all.ps1 -Full -Force

# Full reset + reclaim disk space
.\stop_all.ps1 -Full -Force -Prune

# Rebuild from scratch
.\stop_all.ps1 -Full -Force
.\start_all.ps1 -Rebuild
```

### What `-Volumes` deletes

| Volume | Contents |
|--------|----------|
| `ctm_postgres-data` | All spreadsheet data, users, schemas, AI embeddings |
| `ctm_redis-data` | Cached sessions, presence state, formula cache |
| `ctm_kafka-data` | All Kafka topic data and offsets |
| `ctm_minio-data` | All uploaded file attachments and exports |
| `ctm_keycloak-data` | Auth realm config, registered users |

> ⚠ **Warning:** `-Volumes` is irreversible. All data will be permanently deleted.

---

## Access Points

Once all services are running:

| URL | Service | Description |
|-----|---------|-------------|
| http://localhost:3000 | **Frontend** | Main application — sign in here |
| http://localhost:3001/v1/docs | **API Gateway** | Swagger UI — interactive REST API docs |
| http://localhost:8001/docs | **AI Service** | FastAPI docs — AI endpoint testing |
| http://localhost:8080 | **Keycloak** | Auth server admin console |
| http://localhost:8090 | **Kafka UI** | Topic browser, consumer lag monitoring |
| http://localhost:9001 | **MinIO Console** | Object storage browser |

---

## Default Credentials

### Application

| Role | Email | Password |
|------|-------|----------|
| Admin (OWNER) | `admin@ctm.app` | `admin123` |
| Demo (EDITOR) | `demo@ctm.app` | `demo123` |

### Keycloak Admin Console (`http://localhost:8080/admin`)

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin_dev_pass` |

### MinIO Console (`http://localhost:9001`)

| Field | Value |
|-------|-------|
| Username | `ctm_admin` |
| Password | `ctm_minio_pass` |

---

## Feature Guide

### Spreadsheet Grid (M1 + M2 + M4)

The grid is rendered on an HTML `<canvas>` using a custom 2D engine — not a DOM table. This allows smooth 60 fps scrolling across sheets with up to **500,000 rows × 200 columns**.

| Feature | How to use |
|---------|-----------|
| **Navigate cells** | Arrow keys, Tab, Enter |
| **Edit a cell** | Double-click or press `F2` |
| **Enter a formula** | Start typing `=` (e.g. `=SUM(A1:A10)`) |
| **Multi-select** | Click and drag, or Shift+click for range |
| **Undo / Redo** | `Ctrl+Z` / `Ctrl+Y` — unlimited undo within session, synced across collaborators |
| **Column resize** | Drag the column header divider |

**Supported formula functions:** 400+ Excel-compatible (SUM, IF, VLOOKUP, XLOOKUP, SUMIFS, NETWORKDAYS, PMT, STDEV, CORREL, and more via Hyperformula).

**AI cell functions:**

| Formula | Description |
|---------|-------------|
| `=AI.QUERY("total sales in Q1", A:D)` | Natural language query over a cell range |
| `=AI.SUMMARIZE(A1:A100)` | Summarise a range as natural language text |
| `=AI.CLASSIFY(B2, "positive,negative,neutral")` | Classify text into named categories |
| `=AI.EXTRACT(C5, "email")` | Extract a named entity from text |

AI formulas evaluate asynchronously — the cell shows `#LOADING...` while waiting, then updates with the result. Results are cached for 1 hour.

### Real-time Collaboration (M2)

Multiple users can edit the same sheet simultaneously. Changes are merged automatically using **Yjs CRDTs** — there are no locking conflicts.

| Feature | Detail |
|---------|--------|
| **Live cursors** | Every collaborator's active cell is shown as a coloured border with their initials |
| **Presence bar** | Avatar strip in the top-right shows who is currently in the sheet |
| **Offline editing** | Changes made offline are stored in IndexedDB and synced automatically on reconnect |
| **Conflict-free** | CRDT math guarantees all clients converge to the same state regardless of edit order |

### Project Management Views (M1 + M5)

Switch between views using the **View Picker** bar below the toolbar.

| View | Description |
|------|-------------|
| **Grid** | Default spreadsheet view with filters, sort, and group-by |
| **Gantt** | Timeline bars driven by Start Date / End Date columns. Drag to reschedule. Critical path highlighted in red. |
| **Kanban** | Columns mapped to a Status field. Drag cards between columns. |
| **Calendar** | Month/week/day calendar from a Date column. Drag to reschedule. |
| **Form** | Auto-generated data-entry form. Each submission creates a new row. |
| **Dashboard** | Widget canvas — bar/line/pie charts, metric cards, embedded views. |
| **Timeline** | Horizontal swimlane per assignee with dependency lines. |

### Gantt Chart & Critical Path (M5)

The PM service computes the **Critical Path Method (CPM)** on the server using the full task dependency graph.

- **Dependency types:** Finish-to-Start (FS), Start-to-Start (SS), Finish-to-Finish (FF), Start-to-Finish (SF), with positive or negative lag
- **Critical path** highlighted in the Gantt view — tasks with zero float
- **Baselines** — snapshot the current schedule for variance tracking
- Performance target: p99 < 200 ms for 1,000 tasks

### Approval Chains (M5)

Any row can have an approval workflow attached. Workflows are defined as an ordered list of approver steps with conditions.

```
States: DRAFT → PENDING → IN_REVIEW → APPROVED
                                    → REJECTED
                                    → ESCALATED (SLA breach)
```

- **Sequential or parallel** approver modes
- **Conditional steps** — e.g. "only require CFO approval if Amount > 10,000"
- **Auto-escalation** after a configurable SLA (e.g. 48 hours)
- Full audit log of every action with timestamp and optional note

### Workflow Triggers (M5)

Automation rules that fire when conditions are met.

| Trigger event | Example condition | Available actions |
|--------------|------------------|------------------|
| Row created | *(always)* | Send notification, trigger approval |
| Row updated | `Status = "Done"` | Update another cell, call webhook |
| Status changed | `Priority = "High"` | Create a new row, move row to sheet |
| Date reached | `DueDate = today()` | Send email, run AI agent |
| Approval completed | `Decision = "Approved"` | Call external webhook |

### AI Assistant Panel (M6)

Open with the **AI Panel** button in the toolbar, or press `Ctrl+K`.

| Mode | Description |
|------|-------------|
| **Ask** | Natural language query — "What were total sales last month?" → SQL executed against your data → results shown as a table or chart |
| **Analyze** | Run a LangGraph Data Analyst agent over the full sheet — finds patterns, outliers, and provides insights |
| **Generate** | Describe a formula in plain English — "Sum sales for Q1 where region is West" → `=SUMIFS(D:D,B:B,"West",C:C,"Q1")` |
| **Automate** | LangGraph Workflow Suggester reviews your data and recommends automation triggers |

**Privacy:** By default, only column names and types are sent to the LLM — never cell values. Users must explicitly grant data access per session.

**Human-in-the-loop:** Agent actions that write data (insert row, update cell) are paused and shown as a diff card for user approval before being applied.

### Cell Comments & Chat (M7)

**Cell comments:**
- Right-click any cell to add a comment
- Full threading with replies
- Emoji reactions (👍 ✅ 🚩)
- `@mention` any workspace member — they receive a notification
- Mark as **Resolved** to collapse the thread

**Workspace chat:**
- Organised into channels per project (`#general`, `#announcements`, auto-created project channels)
- Direct messages (1:1 and group DMs up to 10 members)
- Markdown formatting, emoji picker, file sharing
- Full-text search across all messages

**Notifications:**
- In-app notification bell with unread count
- Email digest (immediate / hourly / daily — configurable per user per notification type)
- Outbound webhooks for external integrations (HMAC-SHA256 signed)

### MCP Server (M3)

The API Gateway exposes a **Model Context Protocol (MCP)** server at `http://localhost:3001/mcp`. This allows AI clients such as **Claude Desktop**, **Cursor**, and **Codex** to interact with CTM data directly via tool calls.

**Available tools:**

| Tool | Description |
|------|-------------|
| `read_sheet` | Read column schema and metadata |
| `read_rows` | Paginated row data |
| `filter_rows` | Filtered row query |
| `update_cell` | Update a single cell value |
| `insert_row` | Insert a new row with cell values |
| `delete_row` | Soft-delete a row |
| `create_sheet` | Create a new sheet |
| `run_formula` | Evaluate a formula expression |
| `get_column_schema` | Get column definitions |
| `trigger_workflow` | Fire a named workflow trigger |
| `query_data_nl` | Natural language → SQL → results |

**Authentication:** OAuth 2.0 device flow via Keycloak. Write tools require EDITOR role.

---

## API Reference

Base URL: `http://localhost:3001/v1`

Interactive docs: **http://localhost:3001/v1/docs** (Swagger UI)

### Core endpoints

```
# Workspaces
GET    /workspaces
GET    /workspaces/:id
PUT    /workspaces/:id

# Sheets
GET    /sheets
POST   /sheets
GET    /sheets/:id
PUT    /sheets/:id
DELETE /sheets/:id

# Columns
GET    /sheets/:id/columns
POST   /sheets/:id/columns
PUT    /sheets/:id/columns/:colId
DELETE /sheets/:id/columns/:colId

# Rows  
GET    /sheets/:id/rows
POST   /sheets/:id/rows          (bulk insert, up to 500 rows)
PUT    /sheets/:id/rows/:rowId
DELETE /sheets/:id/rows/:rowId

# Cells
GET    /sheets/:id/rows/:rowId/cells
PUT    /sheets/:id/rows/:rowId/cells/:colId

# AI
POST   /ai/query                 (→ SSE stream)
POST   /ai/formula
POST   /ai/agent                 (→ SSE stream)

# Project Management
GET    /projects
POST   /projects
GET    /projects/:id/tasks
GET    /projects/:id/critical-path
POST   /projects/:id/approvals/:rowId/approve
POST   /projects/:id/approvals/:rowId/reject

# Search
GET    /search?q=&scope=workspace|sheet

# Webhooks
GET    /webhooks
POST   /webhooks
DELETE /webhooks/:id

# Users
GET    /users
GET    /users/me
POST   /users/tokens             (create Personal Access Token)
DELETE /users/tokens/:id
```

### Authentication

All API calls require a `Bearer` token:

```powershell
# Get a token from Keycloak
$token = (Invoke-RestMethod `
  -Uri "http://localhost:8080/realms/ctm/protocol/openid-connect/token" `
  -Method POST `
  -Body @{
      grant_type    = "password"
      client_id     = "ctm-web"
      username      = "demo@ctm.app"
      password      = "demo123"
  }).access_token

# Use the token
Invoke-RestMethod `
  -Uri "http://localhost:3001/v1/sheets" `
  -Headers @{ Authorization = "Bearer $token"; "X-Workspace-Id" = "<workspace-id>" }
```

Or generate a long-lived **Personal Access Token (PAT)**:

```http
POST /v1/users/tokens
{ "name": "My Integration" }

→ { "data": { "token": "ctm_pat_abc123...", "name": "My Integration" } }
```

---

## Development Workflow

### Viewing logs

```powershell
# All services
docker compose logs -f

# Single service
docker compose logs -f api-service
docker compose logs -f ai-service
docker compose logs -f collab-service
```

### Rebuilding a single service after code changes

```powershell
docker compose build api-service
docker compose up -d api-service
```

Or use the start script:

```powershell
.\start_all.ps1 -Rebuild
```

### Running database migrations

Migrations are applied automatically on first startup via `docker-entrypoint-initdb.d`. To re-run manually:

```powershell
# Connect to PostgreSQL
docker exec -it ctm-postgres psql -U ctm -d ctm

# List applied migrations
\dt
```

### Inspecting Kafka topics

Open **http://localhost:8090** (Kafka UI) to browse topics, view messages, and monitor consumer group lag.

Topics used by CTM:

| Topic | Producer | Consumers |
|-------|---------|----------|
| `ctm.cells` | M2, M4 | M4 (recalc), M6 (RAG index), M7 (comment triggers) |
| `ctm.rows` | M3, M5 | M4, M5 (triggers), M7 (notifications) |
| `ctm.approvals` | M5 | M7 (notifications) |
| `ctm.workflows` | M5 | M3 (webhooks), M7 (notifications) |
| `ctm.ai.jobs` | M4, M5 | M6 (formula eval + agents) |
| `ctm.notifications` | M5, M6, M7 | M7 (fan-out) |
| `ctm.audit` | All services | Audit log writer |

### Resetting the AI embedding index

```powershell
docker exec -it ctm-postgres psql -U ctm -d ctm -c "TRUNCATE ai.embeddings;"
```

Embeddings will be re-indexed the next time rows are created or updated (via Kafka consumer in M6).

---

## Technology Stack

| Layer | Technology | License |
|-------|-----------|---------|
| Frontend framework | Next.js 15 (App Router, PPR) | MIT |
| Grid renderer | Custom Canvas 2D engine | — |
| UI components | shadcn/ui + Radix UI | MIT |
| Styling | TailwindCSS 3 | MIT |
| Client state | Zustand 5 | MIT |
| Server state | TanStack Query 5 | MIT |
| CRDT library | Yjs 13 | MIT |
| WebSocket server | Hocuspocus 2 | MIT |
| API framework | Fastify 5 | MIT |
| ORM | Drizzle ORM | MIT |
| Formula engine | Hyperformula 2 (MIT) | MIT |
| Auth | Keycloak 24 + NextAuth.js 5 | Apache 2.0 / MIT |
| Go framework | Gin + gRPC | MIT |
| Approval FSM | looplab/fsm | Apache 2.0 |
| Scheduler | Temporal.io SDK | MIT |
| AI framework | LangGraph 0.2 | MIT |
| LLM (primary) | Claude via Vertex AI | Commercial |
| LLM (fallback) | Anthropic / OpenAI | Commercial |
| Embeddings | Google text-embedding-004 | Commercial |
| Vector search | pgvector 0.7 (HNSW index) | PostgreSQL |
| Event bus | Apache Kafka 3.7 (KRaft) | Apache 2.0 |
| Database | PostgreSQL 16 | PostgreSQL |
| Cache | Redis 7.2 | BSD-3 |
| Object storage | MinIO (S3-compatible) | AGPL / Commercial |
| Email | Resend API | Commercial |
| Observability | OpenTelemetry + Prometheus | Apache 2.0 |

---

*CTM Platform · Architecture C · Version 1.0 · May 2026*
