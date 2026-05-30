package repository

import (
	"context"
	"encoding/json"
	"time"
)

// ─── Task ────────────────────────────────────────────────────────────────────

type Task struct {
	ID           string
	ProjectID    string
	SheetID      string
	RowID        string
	Name         string
	StartDate    *time.Time
	EndDate      *time.Time
	DurationDays int
	AssigneeID   *string
	Status       string
	IsMilestone  bool
	IsCritical   bool
	FloatDays    *int
	CreatedAt    time.Time
	UpdatedAt    time.Time
	DeletedAt    *time.Time
}

type Dependency struct {
	ID             string
	FromTaskID     string
	ToTaskID       string
	DependencyType string
	LagDays        int
}

// ─── Approval ────────────────────────────────────────────────────────────────

type Approval struct {
	ID           string
	RowID        string
	SheetID      string
	WorkflowDef  json.RawMessage
	CurrentState string
	History      []json.RawMessage
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type ApprovalUpdate struct {
	ID           string
	CurrentState string
	HistoryEntry json.RawMessage
}

// ─── Workflow Trigger ─────────────────────────────────────────────────────────

type TriggerAction struct {
	Type   string                 `json:"type"`
	Config map[string]interface{} `json:"config"`
}

type WorkflowTrigger struct {
	ID         string
	SheetID    string
	EventType  string
	Conditions string
	Actions    []TriggerAction
	Enabled    bool
	LastFiredAt *time.Time
}

// ─── Time Entry ────────────────────────────────────────────────────────────────

type TimeEntry struct {
	ID              string
	RowID           string
	UserID          string
	StartedAt       time.Time
	EndedAt         *time.Time
	DurationSeconds *int
	Note            string
}

// ─── Project ─────────────────────────────────────────────────────────────────

type Project struct {
	ID          string
	WorkspaceID string
	Name        string
	Status      string
	StartDate   *time.Time
	EndDate     *time.Time
	Settings    json.RawMessage
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

type TaskRepository interface {
	ListProjectTasks(ctx context.Context, projectID string) ([]*Task, error)
	ListProjectDependencies(ctx context.Context, projectID string) ([]*Dependency, error)
	CreateTask(ctx context.Context, task *Task) error
	GetTask(ctx context.Context, id string) (*Task, error)
	UpdateTask(ctx context.Context, task *Task) error
	DeleteTask(ctx context.Context, id string) error
	UpdateCPMResults(ctx context.Context, projectID string, results []*Task) error
}

type ProjectRepository interface {
	ListWorkspaceProjects(ctx context.Context, workspaceID string) ([]*Project, error)
	CreateProject(ctx context.Context, project *Project) error
	GetProject(ctx context.Context, id string) (*Project, error)
}

type ApprovalRepository interface {
	CreateApproval(ctx context.Context, approval *Approval) error
	GetApproval(ctx context.Context, id string) (*Approval, error)
	UpdateApproval(ctx context.Context, update *ApprovalUpdate) error
	GetRowApproval(ctx context.Context, rowID string) (*Approval, error)
}

type TriggerRepository interface {
	ListEnabledTriggers(ctx context.Context, sheetID string) ([]*WorkflowTrigger, error)
	CreateTrigger(ctx context.Context, trigger *WorkflowTrigger) error
	UpdateTrigger(ctx context.Context, trigger *WorkflowTrigger) error
	UpdateLastFired(ctx context.Context, id string) error
}

type TimeRepository interface {
	LogTime(ctx context.Context, entry *TimeEntry) error
	GetTaskTime(ctx context.Context, rowID string) (int, error)
	GetProjectTime(ctx context.Context, projectID string) (int, error)
}
