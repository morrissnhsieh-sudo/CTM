// Package cpm implements the Critical Path Method (CPM) algorithm
// for Gantt chart scheduling in the CTM PM Service.
package cpm

import (
	"context"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/ctm/pm-service/internal/repository"
	"go.uber.org/zap"
)

// DependencyType represents the relationship between tasks.
type DependencyType string

const (
	FinishToStart DependencyType = "FS"
	StartToStart  DependencyType = "SS"
	FinishToFinish DependencyType = "FF"
	StartToFinish DependencyType = "SF"
)

// CPMTask extends Task with CPM scheduling fields.
type CPMTask struct {
	*repository.Task
	EarlyStart  time.Time
	EarlyFinish time.Time
	LateStart   time.Time
	LateFinish  time.Time
	TotalFloat  int // days
	FreeFloat   int // days
	IsCritical  bool
}

// CriticalPath is the result of a CPM computation.
type CriticalPath struct {
	ProjectID       string
	CriticalTaskIDs []string
	TotalDuration   int
	StartDate       time.Time
	EndDate         time.Time
	Tasks           []*CPMTask
}

type Service struct {
	repo repository.TaskRepository
	log  *zap.Logger
}

func NewService(repo repository.TaskRepository, log *zap.Logger) *Service {
	return &Service{repo: repo, log: log}
}

// Compute runs the CPM algorithm on all tasks in a project.
// Returns the critical path and scheduling for each task.
// Time complexity: O(V + E) where V = tasks, E = dependencies.
// p99 target: < 200ms for 1000 tasks.
func (s *Service) Compute(ctx context.Context, projectID string) (*CriticalPath, error) {
	tasks, err := s.repo.ListProjectTasks(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("listing tasks: %w", err)
	}

	deps, err := s.repo.ListProjectDependencies(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("listing dependencies: %w", err)
	}

	// ── Step 1: Build the DAG ─────────────────────────────────
	taskMap := make(map[string]*CPMTask, len(tasks))
	for _, t := range tasks {
		if t.StartDate == nil || t.EndDate == nil {
			continue // skip tasks without dates
		}
		taskMap[t.ID] = &CPMTask{Task: t}
	}

	type edge struct {
		from, to   string
		depType    DependencyType
		lagDays    int
	}
	forward := make(map[string][]edge)
	reverse := make(map[string][]edge)

	for _, d := range deps {
		e := edge{
			from:    d.FromTaskID,
			to:      d.ToTaskID,
			depType: DependencyType(d.DependencyType),
			lagDays: d.LagDays,
		}
		forward[d.FromTaskID] = append(forward[d.FromTaskID], e)
		reverse[d.ToTaskID] = append(reverse[d.ToTaskID], e)
	}

	// ── Step 2: Topological sort (Kahn's algorithm) ────────────
	order, err := topoSort(taskMap, forward)
	if err != nil {
		return nil, fmt.Errorf("dependency cycle detected: %w", err)
	}

	// ── Step 3: Forward pass — compute Early Start / Early Finish ──
	for _, id := range order {
		task := taskMap[id]
		if task == nil {
			continue
		}

		duration := task.DurationDays
		if duration == 0 {
			duration = 1 // milestones get 0-duration on display but 1 day for calc
		}

		// Earliest start: max(0, predecessors' constraints)
		earlyStart := *task.StartDate
		for _, e := range reverse[id] {
			pred := taskMap[e.from]
			if pred == nil {
				continue
			}

			var constrainedStart time.Time
			switch e.depType {
			case FinishToStart:
				constrainedStart = pred.EarlyFinish.AddDate(0, 0, e.lagDays)
			case StartToStart:
				constrainedStart = pred.EarlyStart.AddDate(0, 0, e.lagDays)
			case FinishToFinish:
				// B finish = A finish + lag → B start = B finish - B duration
				predFinish := pred.EarlyFinish.AddDate(0, 0, e.lagDays)
				constrainedStart = predFinish.AddDate(0, 0, -duration)
			case StartToFinish:
				// B finish >= A start + lag
				predStart := pred.EarlyStart.AddDate(0, 0, e.lagDays)
				constrainedStart = predStart.AddDate(0, 0, -duration)
			}

			if constrainedStart.After(earlyStart) {
				earlyStart = constrainedStart
			}
		}

		task.EarlyStart = earlyStart
		task.EarlyFinish = earlyStart.AddDate(0, 0, duration)
	}

	// ── Step 4: Find project end date ─────────────────────────
	var projectEnd time.Time
	for _, t := range taskMap {
		if t.EarlyFinish.After(projectEnd) {
			projectEnd = t.EarlyFinish
		}
	}

	// ── Step 5: Backward pass — compute Late Start / Late Finish ──
	for i := len(order) - 1; i >= 0; i-- {
		id := order[i]
		task := taskMap[id]
		if task == nil {
			continue
		}

		duration := task.DurationDays
		if duration == 0 {
			duration = 1
		}

		// Default: Late Finish = project end
		task.LateFinish = projectEnd
		for _, e := range forward[id] {
			succ := taskMap[e.to]
			if succ == nil {
				continue
			}

			var constrainedLateFinish time.Time
			switch e.depType {
			case FinishToStart:
				constrainedLateFinish = succ.LateStart.AddDate(0, 0, -e.lagDays)
			case StartToStart:
				constrainedLateFinish = succ.LateStart.AddDate(0, 0, duration-e.lagDays)
			case FinishToFinish:
				constrainedLateFinish = succ.LateFinish.AddDate(0, 0, -e.lagDays)
			case StartToFinish:
				constrainedLateFinish = succ.LateFinish.AddDate(0, 0, duration-e.lagDays)
			}

			if constrainedLateFinish.Before(task.LateFinish) {
				task.LateFinish = constrainedLateFinish
			}
		}

		task.LateStart = task.LateFinish.AddDate(0, 0, -duration)
		task.TotalFloat = int(math.Round(task.LateStart.Sub(task.EarlyStart).Hours() / 24))
		task.IsCritical = task.TotalFloat == 0
	}

	// ── Step 6: Compute Free Float ─────────────────────────────
	for _, id := range order {
		task := taskMap[id]
		if task == nil {
			continue
		}

		task.FreeFloat = int(projectEnd.Sub(task.EarlyFinish).Hours() / 24)
		for _, e := range forward[id] {
			succ := taskMap[e.to]
			if succ == nil {
				continue
			}
			ff := int(succ.EarlyStart.Sub(task.EarlyFinish.AddDate(0, 0, e.lagDays)).Hours() / 24)
			if ff < task.FreeFloat {
				task.FreeFloat = ff
			}
		}
		if task.FreeFloat < 0 {
			task.FreeFloat = 0
		}
	}

	// ── Step 7: Collect results ────────────────────────────────
	var criticalIDs []string
	var allTasks []*CPMTask
	for _, t := range taskMap {
		allTasks = append(allTasks, t)
		if t.IsCritical {
			criticalIDs = append(criticalIDs, t.ID)
		}
	}

	// Sort by EarlyStart for deterministic output
	sort.Slice(allTasks, func(i, j int) bool {
		return allTasks[i].EarlyStart.Before(allTasks[j].EarlyStart)
	})

	var projectStart time.Time
	if len(allTasks) > 0 {
		projectStart = allTasks[0].EarlyStart
	}

	totalDuration := int(math.Round(projectEnd.Sub(projectStart).Hours() / 24))

	s.log.Info("CPM computed",
		zap.String("projectId", projectID),
		zap.Int("tasks", len(allTasks)),
		zap.Int("criticalTasks", len(criticalIDs)),
		zap.Int("totalDuration", totalDuration),
	)

	return &CriticalPath{
		ProjectID:       projectID,
		CriticalTaskIDs: criticalIDs,
		TotalDuration:   totalDuration,
		StartDate:       projectStart,
		EndDate:         projectEnd,
		Tasks:           allTasks,
	}, nil
}

// topoSort uses Kahn's algorithm to produce a topological ordering.
// Returns error if a cycle is detected.
func topoSort(tasks map[string]*CPMTask, edges map[string][]edge) ([]string, error) {
	type edge struct {
		from, to   string
		depType    DependencyType
		lagDays    int
	}

	inDegree := make(map[string]int, len(tasks))
	successors := make(map[string][]string)

	for id := range tasks {
		inDegree[id] = 0
	}

	for from, outEdges := range edges {
		for _, e := range outEdges {
			if _, ok := tasks[e.to]; !ok {
				continue
			}
			successors[from] = append(successors[from], e.to)
			inDegree[e.to]++
		}
	}

	queue := make([]string, 0, len(tasks))
	for id, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, id)
		}
	}
	sort.Strings(queue) // deterministic order

	var order []string
	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]
		order = append(order, curr)

		for _, succ := range successors[curr] {
			inDegree[succ]--
			if inDegree[succ] == 0 {
				queue = append(queue, succ)
			}
		}
		sort.Strings(queue)
	}

	if len(order) != len(tasks) {
		return nil, fmt.Errorf("cycle detected in task dependencies")
	}

	return order, nil
}
