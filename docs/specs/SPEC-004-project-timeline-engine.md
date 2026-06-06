# SPEC-004: Project & Timeline Management Engine

**Status**: Draft  
**Date**: 2026-06-05  
**Author**: Engineering Team  
**Related**: [SPEC-003: File System Hierarchy](SPEC-003-file-system-hierarchy.md)

---

## 1. Overview

This specification defines the interactive project and timeline management engine for CTM. The engine couples a structured task grid (tabular data entry) with a dynamic Gantt chart visualization rendered on a high-performance canvas. Changes to task data — whether typed into the grid or made by dragging the Gantt bars — are reflected immediately in both views and automatically cascade through the dependency graph.

The engine is implemented across two services:

| Layer | Service | Responsibility |
|-------|---------|---------------|
| Persistence & scheduling | `pm-service` (Go) | Task CRUD, dependency storage, CPM algorithm, cascade computation |
| Visualization & interaction | `frontend` (Next.js) | Split-pane UI, canvas Gantt rendering, drag events, real-time sync |
| Event routing | `api-service` (Fastify) | Proxies task mutations to `pm-service`; emits Kafka events for collab |

---

## 2. Task Data Model

### 2.1 Task Grid Column Schema

The task grid is the authoritative data entry layer. Each row maps 1-to-1 to a `pm.tasks` record via `(sheet_id, row_id)`.

| Column | DB Column | Type | Constraint | Behavior |
|--------|-----------|------|------------|----------|
| **Task ID** | `pm.tasks.id` | UUID (displayed as auto-inc integer) | Auto-generated, unique, non-nullable | Primary row lookup key; displayed as sequential integer in UI |
| **Task Name** | `pm.tasks.name` | TEXT | Max 255 chars, required | Anchors the row; labels the Gantt bar |
| **Start Date** | `pm.tasks.start_date` | DATE (`YYYY-MM-DD`) | ≤ Finish Date | Sets the left boundary coordinate $X_{\text{start}}$ of the Gantt bar |
| **Finish Date** | `pm.tasks.end_date` | DATE (`YYYY-MM-DD`) | ≥ Start Date | Sets the right boundary coordinate $X_{\text{end}}$ of the Gantt bar |
| **Duration** | `pm.tasks.duration_days` | INT (computed) | Generated: `end_date − start_date` | Read-only in grid; recomputed server-side on every date change |
| **Assigned To** | `pm.tasks.assignee_id` | UUID FK → `users.id` | Valid user in workspace | Links ownership; used for filter views and resource loading |
| **Predecessors** | `pm.task_dependencies` | Integer array (display) | Must reference valid active Task IDs; no circular references | Defines the DAG execution sequence; stored as rows in `pm.task_dependencies` |
| **Dependency Type** | `pm.task_dependencies.dependency_type` | ENUM | `FS`, `SS`, `FF`, `SF` | Controls how predecessor finish/start constrains successor start/finish |
| **Lag Days** | `pm.task_dependencies.lag_days` | INT | Default 0; can be negative (lead) | Added to the predecessor constraint date before applying the rule |
| **Status** | `pm.tasks.status` | ENUM | `Not Started`, `In Progress`, `Complete` | Drives fill style and progress indicator on Gantt bar |
| **At Risk** | Derived | BOOLEAN | True when `float_days = 0` AND status ≠ `Complete` | Triggers red visual accent on bar; no separate DB column |
| **Is Milestone** | `pm.tasks.is_milestone` | BOOLEAN | Default false | Renders as a diamond marker rather than a bar; duration is displayed as 0 |
| **Is Critical** | `pm.tasks.is_critical` | BOOLEAN | Computed by CPM engine | Renders with critical-path color override |
| **Float Days** | `pm.tasks.float_days` | INT | Computed by CPM engine | Total float; 0 = critical path |

### 2.2 Dependency Types

| Code | Name | Rule |
|------|------|------|
| `FS` | Finish-to-Start | Successor start ≥ Predecessor finish + lag |
| `SS` | Start-to-Start | Successor start ≥ Predecessor start + lag |
| `FF` | Finish-to-Finish | Successor finish ≥ Predecessor finish + lag |
| `SF` | Start-to-Finish | Successor finish ≥ Predecessor start + lag |

The default dependency type when a user enters a predecessor is `FS` with lag = 0.

### 2.3 Predecessors Column Format

In the grid, predecessors are entered as a comma-separated string of task integers with optional type/lag suffixes:

```
3          → Task 3, FS+0 (default)
3FS+2      → Task 3, FS, lag 2 days
5SS-1      → Task 5, SS, lead 1 day
4,7FF      → Tasks 4 and 7, both FF+0
```

The parser expands these into `pm.task_dependencies` rows on save.

---

## 3. Gantt Chart Rendering Engine

### 3.1 Architecture

```
┌─────────────────────┐     ┌──────────────────────────────────────┐
│   Task Grid (left)  │     │     Gantt Canvas (right)             │
│                     │◄────┤                                      │
│  Row 1: Task A      │     │  ████████░░░░░░                      │
│  Row 2: Task B      │     │      ░░░████████░                    │
│  Row 3: Task C  ────┼────►│              ░░░████                 │
│                     │     │                                      │
│  [Shared vertical   │     │  [Horizontal time axis:              │
│   scroll lock]      │     │   Days | Weeks | Months]             │
└─────────────────────┘     └──────────────────────────────────────┘
        ▲ data mutations propagate both ways ▲
```

The two panes share a **locked vertical scroll position**. When the user scrolls either pane up or down, the other pane follows in exact sync.

### 3.2 Coordinate System

The Gantt timeline maps calendar dates to pixel X-coordinates using the active **scale resolution**:

| Scale | Unit Width | Use case |
|-------|-----------|---------|
| Day | `px_per_day` | Sprints, short projects (≤ 30 days) |
| Week | `px_per_day × 7` | Mid-length projects (30–180 days) |
| Month | `px_per_day × avg_month` | Long projects (> 180 days) |

Given a viewport origin date $D_0$ and pixels-per-day constant $P$:

$$X_{\text{start}} = (D_{\text{start}} - D_0) \times P$$

$$X_{\text{end}} = (D_{\text{end}} - D_0) \times P + P$$

$$\text{Bar width} = X_{\text{end}} - X_{\text{start}}$$

The **timeline header** renders column labels (day numbers, week numbers, or month names) above the bar area. Column boundaries are drawn as light vertical grid lines.

### 3.3 Bar Visual States

| Condition | Fill Color | Border |
|-----------|-----------|--------|
| Status = `Not Started` | `#94a3b8` (slate) | None |
| Status = `In Progress` | `#3b82f6` (blue) | None |
| Status = `Complete` | `#10b981` (green) | None |
| `is_critical = true` | `#ef4444` (red) | 2px solid red |
| `at_risk = true` (float = 0, not complete) | `#f97316` (orange) | 2px dashed orange |
| Milestone | `#8b5cf6` diamond | — |
| Selected | Any + 4px blue halo | `#2563eb` outline |

Progress fill (proportion complete) is rendered as a darker band within the bar when status = `In Progress`.

### 3.4 Auto-Initialization

The canvas **observes the task list reactively**. Whenever the task data object changes (row added, date edited, cascade applied), the render loop recomputes all bar coordinates and repaints without a manual trigger. No explicit "refresh" or "compile" action is needed.

---

## 4. Interaction Events

### 4.1 Event A — Edge Dragging (Duration Rescheduling)

**Trigger:** `mousedown` on the leftmost or rightmost 5 px of a Gantt bar.

**Cursor:** `ew-resize` on hover over the drag zone.

**Logic:**

1. Detect which edge was grabbed (left = start anchor, right = end anchor).
2. Lock the opposing edge coordinate.
3. On `mousemove`, convert the horizontal pixel delta $\Delta X$ to a date delta:

$$\Delta D = \text{round}\left(\frac{\Delta X}{P}\right) \quad \text{(days)}$$

4. Update the anchored edge date:
   - **Left edge drag** → `start_date_new = start_date_old + ΔD`; `finish_date` unchanged.
   - **Right edge drag** → `finish_date_new = finish_date_old + ΔD`; `start_date` unchanged.
5. Enforce the constraint `start_date ≤ finish_date`. Clamp if the drag would invert them.
6. Recompute duration:

$$\text{Duration} = \text{Finish Date} - \text{Start Date} + 1$$

7. On `mouseup`, commit the mutation to the API and trigger the dependency cascade (§5).

### 4.2 Event B — Center Dragging (Time Shifting)

**Trigger:** `mousedown` within the central body of a Gantt bar (more than 5 px from either edge).

**Cursor:** `grab` on hover; `grabbing` while dragging.

**Logic:**

1. Record `start_date_old` and `finish_date_old` at drag start.
2. On `mousemove`, compute date offset:

$$\Delta T = \text{round}\left(\frac{\Delta X}{P}\right) \quad \text{(days)}$$

3. Shift both dates by the same offset, preserving duration:

$$\text{Start Date}_{\text{new}} = \text{Start Date}_{\text{old}} + \Delta T$$

$$\text{Finish Date}_{\text{new}} = \text{Finish Date}_{\text{old}} + \Delta T$$

4. On `mouseup`, commit the mutation to the API and trigger the dependency cascade (§5).

### 4.3 Optimistic UI

Both drag events update the bar position **optimistically** in the local state while the API round-trip is in flight. If the API returns an error, the bar snaps back to its pre-drag position and a toast notification is shown.

---

## 5. Dependency Cascade Engine

### 5.1 Algorithm

When any task's `start_date` or `finish_date` changes, the cascade engine propagates the change forward through the dependency graph.

```
[Task A mutated]
       │
       ▼
[Build DAG from pm.task_dependencies]
       │
       ▼
[Topological sort (Kahn's algorithm)]
       │
       ▼
[For each successor of Task A, in topological order:]
       │
       ├─ Compute ExpectedStart from all predecessor constraints
       │  ExpectedStart = max over predecessors of:
       │    FS: predecessor.finish + lag + 1
       │    SS: predecessor.start  + lag
       │    FF: predecessor.finish + lag + 1 - duration
       │    SF: predecessor.start  + lag + 1 - duration
       │
       ├─ If CurrentStart < ExpectedStart:
       │    shift = ExpectedStart - CurrentStart
       │    start_date += shift
       │    finish_date += shift   (preserves duration)
       │
       └─ Continue to next generation (recursive forward propagation)
```

The canonical cascade rule for **Finish-to-Start** (default):

$$\text{Expected Start}_B = \max\left(\text{Finish Date}_A\right) + 1 + \text{lag}$$

If $\text{Start Date}_B < \text{Expected Start}_B$, then:

$$\text{Start Date}_B \mathrel{+}= \text{Expected Start}_B - \text{Start Date}_B$$

$$\text{Finish Date}_B \mathrel{+}= \text{same offset} \quad (\text{duration preserved})$$

### 5.2 Cycle Detection

Before executing any cascade, the engine constructs the DAG and validates that no directed cycle exists using Kahn's topological sort. If a cycle is detected:

- The mutation is rejected.
- A `400 DEPENDENCY_CYCLE` error is returned to the client.
- The user is shown a message identifying the offending tasks.

### 5.3 Cascade Execution Location

Cascades run in the **`pm-service`** (Go), not the frontend. This ensures that:

1. The DAG traversal is authoritative and consistent.
2. Concurrent edits from multiple users don't produce conflicting states.
3. The CPM recalculation (§6) can be run atomically after the cascade.

After a cascade, the service emits a `task.cascade_complete` Kafka event containing the full set of updated task records. The frontend subscribes and applies the batch update to local state.

---

## 6. Critical Path Method (CPM)

### 6.1 Overview

After every task mutation or cascade, the `pm-service` recomputes the CPM to identify the critical path and float values. Performance target: **< 200 ms for 1,000 tasks**.

### 6.2 Forward Pass — Early Dates

Traverse tasks in topological order. For each task, compute:

$$ES_i = \max\left(\text{predecessor constraints}\right)$$

$$EF_i = ES_i + \text{Duration}_i - 1$$

Root tasks (no predecessors): $ES_i = \text{Start Date}_i$.

### 6.3 Backward Pass — Late Dates

Traverse tasks in reverse topological order. For each task:

$$LF_i = \min\left(\text{successor constraints}\right)$$

$$LS_i = LF_i - \text{Duration}_i + 1$$

Sink tasks (no successors): $LF_i = \text{Project End Date}$.

### 6.4 Float Calculation

$$\text{Total Float}_i = LS_i - ES_i = LF_i - EF_i$$

$$\text{Free Float}_i = \min_{\text{successors } j}\left(ES_j - EF_i - \text{lag}_{ij}\right)$$

### 6.5 Critical Path Definition

A task is on the critical path if and only if:

$$\text{Total Float}_i = 0$$

### 6.6 Results Storage

After each CPM run, `is_critical` and `float_days` are written back to `pm.tasks` via `UpdateCPMResults`. The frontend reads these fields when rendering bar colors (§3.3).

---

## 7. UI/UX Layout

### 7.1 Split-Pane Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Toolbar: Scale Selector | Today | Zoom In/Out | Template | Baseline] │
├──────────────────────────┬──────────────────────────────────────────────┤
│  Task Grid               │  Gantt Timeline                              │
│  ┌──┬────────────┬──┬──┐ │  ┌──────────────────────────────────────────┐│
│  │ID│ Task Name  │St│En│ │  │Jan  Feb  Mar  Apr  May  Jun  Jul  Aug   ││
│  ├──┼────────────┼──┼──┤ │  ├──────────────────────────────────────────┤│
│  │ 1│ Design     │..│..│ │  │████████                                  ││
│  │ 2│ Dev        │..│..│ │  │         █████████████                    ││
│  │ 3│ QA         │..│..│ │  │                      ██████              ││
│  │ 4│ Deploy     │..│..│ │  │                            ████          ││
│  └──┴────────────┴──┴──┘ │  └──────────────────────────────────────────┘│
│  [shared vertical scroll]│  [horizontal zoom independent]               │
└──────────────────────────┴──────────────────────────────────────────────┘
```

- **Left pane width**: resizable (default 40 % of viewport).
- **Synchronized vertical scroll**: both panes scroll together; rows always stay aligned.
- **Independent horizontal scroll**: timeline can be panned without affecting the grid.
- **Row height**: fixed at 36 px (matching the spreadsheet grid row height standard).

### 7.2 Scale Selector

Three zoom levels toggled from the toolbar:

| Level | Header label | Pixels per day |
|-------|-------------|----------------|
| Day | D/M (e.g., 1 Jan) | 24 px |
| Week | Week number + month | 4 px |
| Month | Month + year | 1.5 px |

A "Fit to Project" button auto-selects the scale that fits the full project span into the current viewport width.

### 7.3 Critical Path Highlight

Tasks with `is_critical = true` render in red (§3.3) and a **critical path overlay** connects them with a bold red arrow line showing the critical sequence from project start to project end.

### 7.4 Today Line

A vertical dashed line in blue marks the current date on the timeline. It auto-repositions on each render.

### 7.5 Baseline Overlay

When a saved baseline exists, ghost bars (semi-transparent grey) render behind the live bars at the baseline positions, allowing visual drift comparison.

### 7.6 Templates Module

A pre-built template selector injects a complete task schema into the grid, bypassing blank initialization:

| Template | Description |
|----------|-------------|
| **Waterfall** | Sequential phases: Requirements → Design → Build → Test → Deploy |
| **Sprint** | 2-week iterative cycles: Planning → Dev → Review → Retro |
| **Product Launch** | Cross-functional: Marketing, Engineering, Legal, Sales tracks |
| **IT Infrastructure** | Network setup, server provisioning, security hardening |

Template injection:
1. Populates `pm.tasks` rows with placeholder names and relative durations.
2. Creates `pm.task_dependencies` entries matching the template topology.
3. Anchors the first task's `start_date` to today; all subsequent dates are offset accordingly.
4. Runs the CPM to compute critical path before first render.

---

## 8. API Contract

All endpoints are under `/v1/projects/:projectId` and require a JWT.

### 8.1 Task Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/projects/:pid/tasks` | List all tasks with CPM fields |
| `POST` | `/projects/:pid/tasks` | Create a task |
| `PUT` | `/projects/:pid/tasks/:tid` | Update task dates / name / status |
| `DELETE` | `/projects/:pid/tasks/:tid` | Soft-delete task |
| `GET` | `/projects/:pid/critical-path` | Run CPM; return critical tasks and float values |
| `POST` | `/projects/:pid/tasks/:tid/dependencies` | Add a dependency |
| `DELETE` | `/projects/:pid/tasks/:tid/dependencies/:depId` | Remove a dependency |

### 8.2 Cascade Endpoint

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/projects/:pid/tasks/:tid/cascade` | Trigger manual cascade from a specific task |

**Request body** (optional, defaults to the stored dates of `tid`):
```json
{
  "startDate": "2026-07-01",
  "finishDate": "2026-07-05"
}
```

**Response:**
```json
{
  "data": {
    "updatedTasks": [
      { "id": "uuid", "startDate": "...", "finishDate": "...", "durationDays": 5 }
    ],
    "criticalPath": { "taskIds": [...], "totalDuration": 42 }
  }
}
```

### 8.3 Baseline Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/projects/:pid/baseline` | Snapshot current schedule as a named baseline |
| `GET` | `/projects/:pid/baselines` | List saved baselines |
| `GET` | `/projects/:pid/baselines/:bid` | Get baseline snapshot for overlay |

### 8.4 Template Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/projects/templates` | List available templates |
| `POST` | `/projects/:pid/templates/:templateId` | Inject template into project |

---

## 9. Implementation Audit

### 9.1 PM Service (Go) — `apps/pm-service/`

| Feature | Status | Notes |
|---------|--------|-------|
| Task CRUD | ✅ Implemented | `pm.tasks` table; `ListProjectTasks`, `CreateTask`, `UpdateTask`, `DeleteTask` in `postgres.go` |
| Dependency storage | ✅ Implemented | `pm.task_dependencies` table with FS/SS/FF/SF + `lag_days` |
| CPM forward pass | ✅ Implemented | `cpm/service.go` — `EarlyStart`, `EarlyFinish` computed |
| CPM backward pass | ✅ Implemented | `LateStart`, `LateFinish` computed |
| Total float | ✅ Implemented | `TotalFloat = LateStart − EarlyStart` |
| Free float | ✅ Implemented | Computed per §6.4 |
| Critical path flag | ✅ Implemented | `IsCritical = TotalFloat == 0` |
| Cycle detection | ✅ Implemented | Kahn's algorithm in `topoSort` |
| Cascade propagation | ⚠️ **Gap** | CPM computes early/late dates but does NOT rewrite `start_date`/`end_date` for successor tasks. Cascades are computed but not persisted back to `pm.tasks`. |
| Baseline snapshot | ✅ Schema exists | `pm.baselines` table; HTTP endpoint `POST /v1/projects/:pid/baseline` exists but only stubs the snapshot; no read/compare endpoint |
| At Risk flag | ⚠️ **Gap** | No field; must be derived client-side from `float_days = 0 AND status ≠ Complete` |
| Dependency type parsing (`3FS+2` syntax) | ⚠️ **Gap** | Not implemented; grid stores raw text; no predecessor string parser |
| Template injection | ❌ **Missing** | No template engine or predefined templates |
| `DELETE /tasks/:tid/dependencies` | ❌ **Missing** | No endpoint to remove individual dependencies |

### 9.2 Frontend — `apps/frontend/`

| Feature | Status | Notes |
|---------|--------|-------|
| Split-pane layout | ⚠️ Partial | `SpecialViews.tsx` contains a Gantt view skeleton; no canvas renderer |
| Canvas Gantt bars | ❌ **Missing** | No canvas/SVG bar rendering implementation |
| Edge drag interaction | ❌ **Missing** | No drag event handlers for bar resizing |
| Center drag interaction | ❌ **Missing** | No drag event handlers for bar shifting |
| Synchronized vertical scroll | ❌ **Missing** | No scroll sync between grid and Gantt panes |
| Scale selector (Day/Week/Month) | ❌ **Missing** | No zoom control |
| Critical path highlight | ❌ **Missing** | `is_critical` field exists in API but not used in render |
| Today line | ❌ **Missing** | |
| Baseline overlay | ❌ **Missing** | |
| Templates module | ❌ **Missing** | |
| Optimistic drag updates | ❌ **Missing** | |

### 9.3 Gap Summary

| # | Gap | Severity | Component |
|---|-----|----------|-----------|
| G-1 | Cascade does not persist updated dates back to `pm.tasks` | High | `pm-service` |
| G-2 | No predecessor string parser (`3FS+2` syntax) | High | `pm-service` |
| G-3 | Canvas Gantt bar renderer not implemented | High | Frontend |
| G-4 | No drag event handlers (edge or center) | High | Frontend |
| G-5 | No synchronized vertical scroll | Medium | Frontend |
| G-6 | At-risk flag is not exposed via API | Medium | `pm-service` |
| G-7 | Template engine absent | Medium | `pm-service` + Frontend |
| G-8 | Dependency deletion endpoint missing | Medium | `pm-service` |
| G-9 | Baseline read and compare endpoints missing | Low | `pm-service` |
| G-10 | Scale selector and zoom controls absent | Low | Frontend |

---

## 10. Implementation Roadmap

### Phase 1 — Core Engine (Backend)
1. **G-1**: Extend `cpm/service.go` to write cascade results back to `pm.tasks.start_date` / `end_date` as part of the CPM run.
2. **G-2**: Add a `ParsePredecessors(input string) ([]Dependency, error)` function that tokenises the `3FS+2` notation and upserts `pm.task_dependencies` rows.
3. **G-6**: Add `at_risk bool` to the `GET /tasks` response (derived: `float_days == 0 AND status != "Complete"`).
4. **G-8**: Add `DELETE /projects/:pid/tasks/:tid/dependencies/:depId` handler.

### Phase 2 — Core Visualization (Frontend)
5. **G-3**: Implement a Canvas/WebGL Gantt renderer (React component wrapping `<canvas>`). Render bars from task list using the coordinate system in §3.2.
6. **G-4**: Implement `mousedown`/`mousemove`/`mouseup` drag handlers for edge and center drag per §4.
7. **G-5**: Implement scroll-sync between the grid pane and the Gantt pane using a shared `scrollTop` ref.
8. **G-10**: Add scale selector toolbar buttons and re-render on scale change.

### Phase 3 — Advanced Features
9. **G-7**: Build template engine — define template JSON schemas; implement `POST /projects/:pid/templates/:tid`; add template picker UI.
10. **G-9**: Implement baseline read/compare: `GET /projects/:pid/baselines/:bid`; render ghost bars overlay on canvas.
11. Critical path overlay arrow rendering (§7.3).
12. Today line (§7.4).

---

## 11. Open Questions

| # | Question | Owner |
|---|----------|-------|
| OQ-1 | Should cascade propagation run synchronously (blocking the API response) or asynchronously via Kafka? Large projects (1000+ tasks) may exceed the 200 ms target if run synchronously. | Engineering |
| OQ-2 | Should the Gantt canvas use Canvas 2D API or a WebGL renderer (e.g., PixiJS) for projects with 10,000+ tasks? | Engineering |
| OQ-3 | Should dragging a bar on the critical path show a live "project end date impact" tooltip? | Product |
| OQ-4 | What is the maximum number of template tasks to inject at once? Is there a size limit per project? | Product |
| OQ-5 | Should backward cascade (pulling dates earlier when a predecessor is moved earlier) be supported, or is forward cascade (pushing dates later) sufficient? | Product |

---

## 12. Related Documents

- [SPEC-003: File System Hierarchy](SPEC-003-file-system-hierarchy.md)
- [PM Service: CPM Implementation](../../apps/pm-service/internal/cpm/service.go)
- [PM Schema Migration](../../infra/postgres/migrations/003_pm_schema.sql)
- [CLAUDE.md §6.2: Create a New Automated Workflow Trigger](../../CLAUDE.md)
