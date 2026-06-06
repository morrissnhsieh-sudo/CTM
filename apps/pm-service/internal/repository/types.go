package repository

import (
	"context"
	"encoding/json"
	"time"
)

// ─── Task ────────────────────────────────────────────────────────────────────

type Task struct {
	ID           string     `json:"id"`
	ProjectID    string     `json:"projectId"`
	SheetID      string     `json:"sheetId"`
	RowID        string     `json:"rowId"`
	Name         string     `json:"name"`
	StartDate    *time.Time `json:"startDate"`
	EndDate      *time.Time `json:"endDate"`
	DurationDays int        `json:"durationDays"`
	AssigneeID   *string    `json:"assigneeId"`
	Status       string     `json:"status"`
	IsMilestone  bool       `json:"isMilestone"`
	IsCritical   bool       `json:"isCritical"`
	FloatDays    *int       `json:"floatDays"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
	DeletedAt    *time.Time `json:"deletedAt,omitempty"`
}

type Dependency struct {
	ID             string `json:"id"`
	FromTaskID     string `json:"fromTaskId"`
	ToTaskID       string `json:"toTaskId"`
	DependencyType string `json:"dependencyType"`
	LagDays        int    `json:"lagDays"`
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
	CreatedBy   *string
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
	CreateDependency(ctx context.Context, dep *Dependency) error
	DeleteDependency(ctx context.Context, id string) error
	ClearTaskDependencies(ctx context.Context, taskID string) error
}

type ProjectRepository interface {
	ListWorkspaceProjects(ctx context.Context, workspaceID string) ([]*Project, error)
	ListOwnedProjects(ctx context.Context, workspaceID, createdBy string) ([]*Project, error)
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

type ResourceAllocation struct {
	ID                string    `json:"id"`
	ResourceID        string    `json:"resourceId"`
	ProjectID         string    `json:"projectId"`
	AllocationPercent int       `json:"allocationPercent"`
	StartDate         time.Time `json:"startDate"`
	EndDate           time.Time `json:"endDate"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type ResourceAllocationRepository interface {
	ListProjectAllocations(ctx context.Context, projectID string) ([]*ResourceAllocation, error)
	ListResourceAllocations(ctx context.Context, resourceID string) ([]*ResourceAllocation, error)
	CreateAllocation(ctx context.Context, alloc *ResourceAllocation) error
}

// ─── Baseline ────────────────────────────────────────────────────────────────

type Baseline struct {
	ID        string          `json:"id"`
	ProjectID string          `json:"projectId"`
	Name      string          `json:"name"`
	Snapshot  json.RawMessage `json:"snapshot"`
	CreatedBy string          `json:"createdBy"`
	CreatedAt time.Time       `json:"createdAt"`
}

type BaselineRepository interface {
	CreateBaseline(ctx context.Context, b *Baseline) error
	ListBaselines(ctx context.Context, projectID string) ([]*Baseline, error)
	GetBaseline(ctx context.Context, id string) (*Baseline, error)
}


