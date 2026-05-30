# CTM — Test Suite

Test cases for all 10 modules, generated from module specifications.

## Structure

```
testing/
├── m1-frontend/
│   ├── unit/
│   │   ├── gridStore.test.ts       Grid state: scroll, selection, edit mode, cell cache
│   │   ├── uiStore.test.ts         UI state: panels, view modes, command palette, theme
│   │   └── presenceColor.test.ts   Collaborator colour assignment (deterministic, 8-palette)
│   └── e2e/
│       └── grid.spec.ts            Playwright: LCP SLO, view picker, AI panel, auth redirect
│
├── m2-collab/
│   ├── unit/
│   │   ├── persistence.test.ts     Y.Doc load/debounce-write, snapshot scheduling
│   │   └── presence.test.ts        Redis presence: setPresence, removePresence, getPresence
│   └── integration/
│       └── crdt-sync.test.ts       Yjs CRDT: convergence, offline edits, binary encoding
│
├── m3-api/
│   ├── unit/
│   │   └── auth.test.ts            RBAC hasMinRole, PAT format/hash, mTLS allowlist, rate limiter
│   └── integration/
│       └── sheets.test.ts          Sheet validation, pagination, RBAC table, default columns
│
├── m4-formula/
│   └── unit/
│       └── engine.test.ts          Hyperformula: SUM/IF/VLOOKUP/SUMIFS/XLOOKUP, errors,
│                                   circular refs, DAG recalc, decimal precision, perf SLO
│
├── m5-pm/                          Go tests (go test ./...)
│   ├── cpm/service_test.go         CPM algorithm: linear chain, parallel paths, lag, cycles,
│                                   milestone, empty project, 1000-task perf SLO
│   ├── approval/service_test.go    FSM: all state transitions, invalid transitions, terminal
│                                   states, full workflow, perf SLO
│   └── trigger/service_test.go     go-expr: AND/OR/numeric conditions, event type filter,
│                                   invalid expressions, perf SLO
│
├── m6-ai/                          Python tests (pytest)
│   ├── unit/
│   │   ├── test_guards.py          5 security guards: scope, injection patterns, budget logic,
│   │   │                           data consent, role levels
│   │   └── test_llm_client.py      LLM factory: Vertex credential loading, model selection,
│   │                               embedding fallback chain
│   └── integration/
│       └── test_query.py           SQL safety whitelist, system prompt hardening,
│                                   schema injection, formula validation
│
├── m7-messaging/
│   └── unit/
│       └── comments.test.ts        Comment validation: target types, body length, parentId,
│                                   mention extraction, reaction uniqueness
│
├── m8-kafka/
│   └── topics.test.ts              Topic config: 7 topics, partition counts, retention, delivery
│                                   guarantees, DLQ naming, event schema validation
│
├── m9-database/
│   ├── rls_policies.test.sql       RLS: workspace isolation, cross-workspace read blocked,
│   │                               current_workspace_id() helper, INSERT isolation
│   └── schema_constraints.test.sql CHECK constraints (role, plan), UNIQUE (email, col position),
│                                   composite PK (cells)
│
├── m10-auth/
│   └── unit/auth.test.ts           JWT claims/TTL, PKCE generation/verification, PAT format/hash,
│                                   auth code properties, Keycloak realm config
│
├── e2e/
│   └── collaboration.spec.ts       Multi-user presence, AI panel query, API health/auth
│
├── run_tests.ps1                   PowerShell test runner (all modules)
├── vitest.config.ts                Vitest config with path aliases
├── playwright.config.ts            Playwright config for E2E
├── setup.ts                        Global mocks (Redis, KafkaJS)
└── package.json                    Test dependencies
```

## Running Tests

### Quick start (unit tests only, no services required)

```powershell
cd C:\Users\User\Code\CTM\testing
pnpm install
.\run_tests.ps1
```

### Individual module

```powershell
.\run_tests.ps1 -Module m1     # M1 Frontend
.\run_tests.ps1 -Module m3     # M3 API Gateway
.\run_tests.ps1 -Module m4     # M4 Formula Engine
.\run_tests.ps1 -Module m5     # M5 PM Service (Go)
.\run_tests.ps1 -Module m6     # M6 AI Service (Python)
.\run_tests.ps1 -Module m10    # M10 Auth
```

### With coverage report

```powershell
.\run_tests.ps1 -Coverage
# Opens testing/coverage/index.html
```

### Integration tests (requires running services)

```powershell
..\start_all.ps1               # start the platform first
.\run_tests.ps1 -Integration
```

### E2E tests (requires full stack on localhost)

```powershell
pnpm playwright install        # install browser binaries (first time)
.\run_tests.ps1 -E2E
# Report at: testing/playwright-report/index.html
```

### All tests

```powershell
.\run_tests.ps1 -All
```

## Per-language commands

### TypeScript (Vitest)
```powershell
pnpm vitest run                   # all TS tests
pnpm vitest run --coverage        # with coverage
pnpm vitest                       # watch mode
pnpm vitest run m4-formula        # single module
```

### Go (M5)
```powershell
cd ..\apps\pm-service
go test ..\..\..\testing\m5-pm\... -v
```

### Python (M6)
```powershell
cd m6-ai
pip install -r requirements-test.txt
python -m pytest unit/ -v
python -m pytest integration/ -v  # needs running AI service
```

### Database (M9)
```powershell
# Requires ctm-postgres container running
docker exec ctm-postgres psql -U ctm -d ctm -f /path/to/rls_policies.test.sql
docker exec ctm-postgres psql -U ctm -d ctm -f /path/to/schema_constraints.test.sql
```

## Coverage targets

| Module | Target | Metric |
|--------|--------|--------|
| M1 Frontend | 80% | Lines, functions |
| M2 Collab | 80% | Lines, functions |
| M3 API | 80% | Lines, branches |
| M4 Formula | 85% | Lines, branches |
| M5 PM (Go) | 80% | Lines |
| M6 AI (Python) | 75% | Lines |
| M7 Messaging | 80% | Lines |
| M8 Kafka | 70% | Logic |
| M9 Database | All RLS paths | SQL |
| M10 Auth | 85% | Security logic |
