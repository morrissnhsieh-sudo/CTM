package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ─── Task Repository ─────────────────────────────────────────────────────────

type postgresTaskRepository struct{ pool *pgxpool.Pool }

func NewTaskRepository(pool *pgxpool.Pool) TaskRepository {
	return &postgresTaskRepository{pool: pool}
}

func (r *postgresTaskRepository) ListProjectTasks(ctx context.Context, projectID string) ([]*Task, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, project_id, sheet_id, row_id, name, start_date, end_date,
		        duration_days, assignee_id, status, is_milestone, is_critical,
		        float_days, created_at, updated_at
		 FROM pm.tasks
		 WHERE project_id = $1 AND deleted_at IS NULL
		 ORDER BY start_date NULLS LAST, created_at`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying tasks: %w", err)
	}
	defer rows.Close()

	var tasks []*Task
	for rows.Next() {
		t := &Task{}
		if err := rows.Scan(
			&t.ID, &t.ProjectID, &t.SheetID, &t.RowID, &t.Name,
			&t.StartDate, &t.EndDate, &t.DurationDays, &t.AssigneeID,
			&t.Status, &t.IsMilestone, &t.IsCritical, &t.FloatDays,
			&t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scanning task: %w", err)
		}
		tasks = append(tasks, t)
	}

	return tasks, rows.Err()
}

func (r *postgresTaskRepository) ListProjectDependencies(ctx context.Context, projectID string) ([]*Dependency, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT d.id, d.from_task_id, d.to_task_id, d.dependency_type, d.lag_days
		 FROM pm.task_dependencies d
		 JOIN pm.tasks t ON t.id = d.from_task_id
		 WHERE t.project_id = $1`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying dependencies: %w", err)
	}
	defer rows.Close()

	var deps []*Dependency
	for rows.Next() {
		d := &Dependency{}
		if err := rows.Scan(&d.ID, &d.FromTaskID, &d.ToTaskID, &d.DependencyType, &d.LagDays); err != nil {
			return nil, err
		}
		deps = append(deps, d)
	}

	return deps, rows.Err()
}

func (r *postgresTaskRepository) CreateTask(ctx context.Context, task *Task) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO pm.tasks (id, project_id, sheet_id, row_id, name, start_date, end_date,
		                       assignee_id, status, is_milestone)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		task.ID, task.ProjectID, task.SheetID, task.RowID, task.Name,
		task.StartDate, task.EndDate, task.AssigneeID, task.Status, task.IsMilestone,
	)
	return err
}

func (r *postgresTaskRepository) GetTask(ctx context.Context, id string) (*Task, error) {
	t := &Task{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, project_id, sheet_id, row_id, name, start_date, end_date,
		        duration_days, assignee_id, status, is_milestone, is_critical,
		        float_days, created_at, updated_at
		 FROM pm.tasks WHERE id = $1 AND deleted_at IS NULL`,
		id,
	).Scan(
		&t.ID, &t.ProjectID, &t.SheetID, &t.RowID, &t.Name,
		&t.StartDate, &t.EndDate, &t.DurationDays, &t.AssigneeID,
		&t.Status, &t.IsMilestone, &t.IsCritical, &t.FloatDays,
		&t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("getting task: %w", err)
	}
	return t, nil
}

func (r *postgresTaskRepository) UpdateTask(ctx context.Context, task *Task) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE pm.tasks
		 SET name=$2, start_date=$3, end_date=$4, assignee_id=$5,
		     status=$6, is_milestone=$7, updated_at=NOW()
		 WHERE id=$1`,
		task.ID, task.Name, task.StartDate, task.EndDate,
		task.AssigneeID, task.Status, task.IsMilestone,
	)
	return err
}

func (r *postgresTaskRepository) DeleteTask(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE pm.tasks SET deleted_at=NOW() WHERE id=$1`, id,
	)
	return err
}

func (r *postgresTaskRepository) UpdateCPMResults(ctx context.Context, projectID string, results []*Task) error {
	for _, t := range results {
		_, err := r.pool.Exec(ctx,
			`UPDATE pm.tasks 
			 SET start_date=$2, end_date=$3, is_critical=$4, float_days=$5, updated_at=NOW() 
			 WHERE id=$1`,
			t.ID, t.StartDate, t.EndDate, t.IsCritical, t.FloatDays,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (r *postgresTaskRepository) CreateDependency(ctx context.Context, dep *Dependency) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO pm.task_dependencies (id, from_task_id, to_task_id, dependency_type, lag_days)
		 VALUES ($1, $2, $3, $4, $5)`,
		dep.ID, dep.FromTaskID, dep.ToTaskID, dep.DependencyType, dep.LagDays,
	)
	return err
}

func (r *postgresTaskRepository) DeleteDependency(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM pm.task_dependencies WHERE id = $1`, id)
	return err
}

func (r *postgresTaskRepository) ClearTaskDependencies(ctx context.Context, taskID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM pm.task_dependencies WHERE to_task_id = $1`, taskID)
	return err
}

// ─── Approval Repository ──────────────────────────────────────────────────────

type postgresApprovalRepository struct{ pool *pgxpool.Pool }

func NewApprovalRepository(pool *pgxpool.Pool) ApprovalRepository {
	return &postgresApprovalRepository{pool: pool}
}

func (r *postgresApprovalRepository) CreateApproval(ctx context.Context, a *Approval) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO pm.approvals (id, row_id, sheet_id, workflow_def, current_state, history)
		 VALUES ($1,$2,$3,$4,$5,$6)`,
		a.ID, a.RowID, a.SheetID, a.WorkflowDef, a.CurrentState, a.History,
	)
	return err
}

func (r *postgresApprovalRepository) GetApproval(ctx context.Context, id string) (*Approval, error) {
	a := &Approval{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, row_id, sheet_id, workflow_def, current_state, history, created_at, updated_at
		 FROM pm.approvals WHERE id=$1`,
		id,
	).Scan(&a.ID, &a.RowID, &a.SheetID, &a.WorkflowDef, &a.CurrentState, &a.History, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("getting approval: %w", err)
	}
	return a, nil
}

func (r *postgresApprovalRepository) GetRowApproval(ctx context.Context, rowID string) (*Approval, error) {
	a := &Approval{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, row_id, sheet_id, workflow_def, current_state, history, created_at, updated_at
		 FROM pm.approvals WHERE row_id=$1 ORDER BY created_at DESC LIMIT 1`,
		rowID,
	).Scan(&a.ID, &a.RowID, &a.SheetID, &a.WorkflowDef, &a.CurrentState, &a.History, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("getting row approval: %w", err)
	}
	return a, nil
}

func (r *postgresApprovalRepository) UpdateApproval(ctx context.Context, u *ApprovalUpdate) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE pm.approvals
		 SET current_state=$2,
		     history = history || ARRAY[$3::jsonb],
		     updated_at=NOW()
		 WHERE id=$1`,
		u.ID, u.CurrentState, u.HistoryEntry,
	)
	return err
}

// ─── Trigger Repository ────────────────────────────────────────────────────────

type postgresTriggerRepository struct{ pool *pgxpool.Pool }

func NewTriggerRepository(pool *pgxpool.Pool) TriggerRepository {
	return &postgresTriggerRepository{pool: pool}
}

func (r *postgresTriggerRepository) ListEnabledTriggers(ctx context.Context, sheetID string) ([]*WorkflowTrigger, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, sheet_id, event_type, conditions, actions, enabled, last_fired_at
		 FROM pm.workflow_triggers WHERE sheet_id=$1 AND enabled=true`,
		sheetID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var triggers []*WorkflowTrigger
	for rows.Next() {
		t := &WorkflowTrigger{}
		var actionsJSON []byte
		if err := rows.Scan(&t.ID, &t.SheetID, &t.EventType, &t.Conditions, &actionsJSON, &t.Enabled, &t.LastFiredAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(actionsJSON, &t.Actions); err != nil {
			t.Actions = nil
		}
		triggers = append(triggers, t)
	}

	return triggers, rows.Err()
}

func (r *postgresTriggerRepository) CreateTrigger(ctx context.Context, t *WorkflowTrigger) error {
	actionsJSON, _ := json.Marshal(t.Actions)
	_, err := r.pool.Exec(ctx,
		`INSERT INTO pm.workflow_triggers (id, sheet_id, event_type, conditions, actions, enabled)
		 VALUES ($1,$2,$3,$4,$5,$6)`,
		t.ID, t.SheetID, t.EventType, t.Conditions, actionsJSON, t.Enabled,
	)
	return err
}

func (r *postgresTriggerRepository) UpdateTrigger(ctx context.Context, t *WorkflowTrigger) error {
	actionsJSON, _ := json.Marshal(t.Actions)
	_, err := r.pool.Exec(ctx,
		`UPDATE pm.workflow_triggers SET conditions=$2, actions=$3, enabled=$4 WHERE id=$1`,
		t.ID, t.Conditions, actionsJSON, t.Enabled,
	)
	return err
}

func (r *postgresTriggerRepository) UpdateLastFired(ctx context.Context, id string) error {
	now := time.Now()
	_, err := r.pool.Exec(ctx, `UPDATE pm.workflow_triggers SET last_fired_at=$2 WHERE id=$1`, id, now)
	return err
}

// ─── Project Repository ────────────────────────────────────────────────────────

type postgresProjectRepository struct{ pool *pgxpool.Pool }

func NewProjectRepository(pool *pgxpool.Pool) ProjectRepository {
	return &postgresProjectRepository{pool: pool}
}

func (r *postgresProjectRepository) ListWorkspaceProjects(ctx context.Context, workspaceID string) ([]*Project, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, name, status, start_date, end_date, settings, created_by
		 FROM pm.projects WHERE workspace_id=$1 ORDER BY created_at`,
		workspaceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []*Project
	for rows.Next() {
		p := &Project{}
		if err := rows.Scan(&p.ID, &p.WorkspaceID, &p.Name, &p.Status, &p.StartDate, &p.EndDate, &p.Settings, &p.CreatedBy); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}

	return projects, rows.Err()
}

func (r *postgresProjectRepository) ListOwnedProjects(ctx context.Context, workspaceID, createdBy string) ([]*Project, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, name, status, start_date, end_date, settings, created_by
		 FROM pm.projects WHERE workspace_id=$1 AND created_by=$2 ORDER BY created_at`,
		workspaceID, createdBy,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []*Project
	for rows.Next() {
		p := &Project{}
		if err := rows.Scan(&p.ID, &p.WorkspaceID, &p.Name, &p.Status, &p.StartDate, &p.EndDate, &p.Settings, &p.CreatedBy); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}

	return projects, rows.Err()
}

func (r *postgresProjectRepository) CreateProject(ctx context.Context, p *Project) error {
	settingsJSON, _ := json.Marshal(p.Settings)
	_, err := r.pool.Exec(ctx,
		`INSERT INTO pm.projects (id, workspace_id, name, status, start_date, end_date, settings, created_by)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		p.ID, p.WorkspaceID, p.Name, p.Status, p.StartDate, p.EndDate, settingsJSON, p.CreatedBy,
	)
	return err
}

func (r *postgresProjectRepository) GetProject(ctx context.Context, id string) (*Project, error) {
	p := &Project{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, workspace_id, name, status, start_date, end_date, settings, created_by
		 FROM pm.projects WHERE id=$1`,
		id,
	).Scan(&p.ID, &p.WorkspaceID, &p.Name, &p.Status, &p.StartDate, &p.EndDate, &p.Settings, &p.CreatedBy)
	if err != nil {
		return nil, fmt.Errorf("getting project: %w", err)
	}
	return p, nil
}

// ─── Time Repository ──────────────────────────────────────────────────────────

type postgresTimeRepository struct{ pool *pgxpool.Pool }

func NewTimeRepository(pool *pgxpool.Pool) TimeRepository {
	return &postgresTimeRepository{pool: pool}
}

func (r *postgresTimeRepository) LogTime(ctx context.Context, e *TimeEntry) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO pm.time_entries (id, row_id, user_id, started_at, ended_at, note)
		 VALUES ($1,$2,$3,$4,$5,$6)`,
		e.ID, e.RowID, e.UserID, e.StartedAt, e.EndedAt, e.Note,
	)
	return err
}

func (r *postgresTimeRepository) GetTaskTime(ctx context.Context, rowID string) (int, error) {
	var total *int
	err := r.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(duration_seconds),0) FROM pm.time_entries WHERE row_id=$1`,
		rowID,
	).Scan(&total)
	if err != nil || total == nil {
		return 0, err
	}
	return *total, nil
}

func (r *postgresTimeRepository) GetProjectTime(ctx context.Context, projectID string) (int, error) {
	var total *int
	err := r.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(te.duration_seconds),0)
		 FROM pm.time_entries te
		 JOIN pm.tasks t ON t.row_id = te.row_id
		 WHERE t.project_id=$1`,
		projectID,
	).Scan(&total)
	if err != nil || total == nil {
		return 0, err
	}
	return *total, nil
}

// ─── Resource Allocation Repository ──────────────────────────────────────────

type postgresResourceAllocationRepository struct{ pool *pgxpool.Pool }

func NewResourceAllocationRepository(pool *pgxpool.Pool) ResourceAllocationRepository {
	return &postgresResourceAllocationRepository{pool: pool}
}

func (r *postgresResourceAllocationRepository) ListProjectAllocations(ctx context.Context, projectID string) ([]*ResourceAllocation, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, resource_id, project_id, allocation_percent, start_date, end_date, created_at, updated_at
		 FROM pm.resource_allocations WHERE project_id=$1`,
		projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var allocs []*ResourceAllocation
	for rows.Next() {
		a := &ResourceAllocation{}
		if err := rows.Scan(&a.ID, &a.ResourceID, &a.ProjectID, &a.AllocationPercent, &a.StartDate, &a.EndDate, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		allocs = append(allocs, a)
	}
	return allocs, rows.Err()
}

func (r *postgresResourceAllocationRepository) ListResourceAllocations(ctx context.Context, resourceID string) ([]*ResourceAllocation, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, resource_id, project_id, allocation_percent, start_date, end_date, created_at, updated_at
		 FROM pm.resource_allocations WHERE resource_id=$1`,
		resourceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var allocs []*ResourceAllocation
	for rows.Next() {
		a := &ResourceAllocation{}
		if err := rows.Scan(&a.ID, &a.ResourceID, &a.ProjectID, &a.AllocationPercent, &a.StartDate, &a.EndDate, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		allocs = append(allocs, a)
	}
	return allocs, rows.Err()
}

func (r *postgresResourceAllocationRepository) CreateAllocation(ctx context.Context, a *ResourceAllocation) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO pm.resource_allocations (id, resource_id, project_id, allocation_percent, start_date, end_date)
		 VALUES ($1,$2,$3,$4,$5,$6)`,
		a.ID, a.ResourceID, a.ProjectID, a.AllocationPercent, a.StartDate, a.EndDate,
	)
	return err
}

// ─── Baseline Repository ──────────────────────────────────────────────────────

type postgresBaselineRepository struct{ pool *pgxpool.Pool }

func NewBaselineRepository(pool *pgxpool.Pool) BaselineRepository {
	return &postgresBaselineRepository{pool: pool}
}

func (r *postgresBaselineRepository) CreateBaseline(ctx context.Context, b *Baseline) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO pm.baselines (id, project_id, name, snapshot, created_by)
		 VALUES ($1,$2,$3,$4,$5)`,
		b.ID, b.ProjectID, b.Name, b.Snapshot, b.CreatedBy,
	)
	return err
}

func (r *postgresBaselineRepository) ListBaselines(ctx context.Context, projectID string) ([]*Baseline, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, project_id, name, snapshot, created_by, created_at
		 FROM pm.baselines WHERE project_id=$1 ORDER BY created_at DESC`,
		projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var baselines []*Baseline
	for rows.Next() {
		b := &Baseline{}
		if err := rows.Scan(&b.ID, &b.ProjectID, &b.Name, &b.Snapshot, &b.CreatedBy, &b.CreatedAt); err != nil {
			return nil, err
		}
		baselines = append(baselines, b)
	}
	return baselines, rows.Err()
}

func (r *postgresBaselineRepository) GetBaseline(ctx context.Context, id string) (*Baseline, error) {
	b := &Baseline{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, project_id, name, snapshot, created_by, created_at
		 FROM pm.baselines WHERE id=$1`,
		id,
	).Scan(&b.ID, &b.ProjectID, &b.Name, &b.Snapshot, &b.CreatedBy, &b.CreatedAt)
	if err != nil {
		return nil, err
	}
	return b, nil
}


