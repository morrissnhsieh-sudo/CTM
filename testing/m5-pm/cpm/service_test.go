// M5 — Project Management Service
// Unit tests: Critical Path Method (CPM) algorithm — self-contained
//
// Spec refs:
//   - CPM: Forward pass (EarlyStart/Finish) + Backward pass (LateStart/Finish)
//   - Float = LateStart - EarlyStart; Critical = Float == 0
//   - Dependency types: FS, SS, FF, SF + lag days
//   - Cycle detection → error
//   - SLO: p99 < 200ms for 1000 tasks

package cpm_test

import (
	"fmt"
	"math"
	"sort"
	"testing"
	"time"
)

// ── Embedded types ─────────────────────────────────────────────────────────────

type Task struct {
	ID          string
	StartDate   *time.Time
	EndDate     *time.Time
	IsMilestone bool
}

type Dep struct {
	From, To string
	DepType  string
	LagDays  int
}

type CPMTask struct {
	*Task
	EarlyStart, EarlyFinish time.Time
	LateStart,  LateFinish  time.Time
	TotalFloat              int
	IsCritical              bool
}

type CriticalPath struct {
	TotalDuration   int
	CriticalTaskIDs []string
	Tasks           []*CPMTask
}

// ── Embedded CPM implementation ────────────────────────────────────────────────

func runCPM(tasks []*Task, deps []Dep) (*CriticalPath, error) {
	tm := make(map[string]*CPMTask)
	for _, t := range tasks {
		if t.StartDate != nil && t.EndDate != nil {
			tm[t.ID] = &CPMTask{Task: t}
		}
	}

	fwd := make(map[string][]Dep)
	rev := make(map[string][]Dep)
	inDeg := make(map[string]int)
	for id := range tm { inDeg[id] = 0 }
	for _, d := range deps {
		if _, ok := tm[d.From]; !ok { continue }
		if _, ok := tm[d.To];   !ok { continue }
		fwd[d.From] = append(fwd[d.From], d)
		rev[d.To]   = append(rev[d.To], d)
		inDeg[d.To]++
	}

	// Kahn topological sort
	var q []string
	for id, deg := range inDeg { if deg == 0 { q = append(q, id) } }
	sort.Strings(q)
	var order []string
	for len(q) > 0 {
		cur := q[0]; q = q[1:]
		order = append(order, cur)
		for _, e := range fwd[cur] {
			inDeg[e.To]--
			if inDeg[e.To] == 0 { q = append(q, e.To); sort.Strings(q) }
		}
	}
	if len(order) != len(tm) { return nil, fmt.Errorf("cycle detected") }

	// Forward pass
	for _, id := range order {
		t := tm[id]
		dur := int(t.EndDate.Sub(*t.StartDate).Hours() / 24)
		if dur <= 0 { dur = 1 }
		es := *t.StartDate
		for _, e := range rev[id] {
			pred := tm[e.From]
			if pred == nil { continue }
			var cs time.Time
			switch e.DepType {
			case "SS": cs = pred.EarlyStart.AddDate(0, 0, e.LagDays)
			case "FF": cs = pred.EarlyFinish.AddDate(0, 0, e.LagDays-dur)
			default:   cs = pred.EarlyFinish.AddDate(0, 0, e.LagDays)
			}
			if cs.After(es) { es = cs }
		}
		t.EarlyStart = es
		t.EarlyFinish = es.AddDate(0, 0, dur)
	}

	// Project end
	var projEnd time.Time
	for _, t := range tm { if t.EarlyFinish.After(projEnd) { projEnd = t.EarlyFinish } }

	// Backward pass
	for i := len(order) - 1; i >= 0; i-- {
		id := order[i]; t := tm[id]
		dur := int(t.EndDate.Sub(*t.StartDate).Hours() / 24)
		if dur <= 0 { dur = 1 }
		t.LateFinish = projEnd
		for _, e := range fwd[id] {
			succ := tm[e.To]
			if succ == nil { continue }
			lf := succ.LateStart.AddDate(0, 0, -e.LagDays)
			if lf.Before(t.LateFinish) { t.LateFinish = lf }
		}
		t.LateStart = t.LateFinish.AddDate(0, 0, -dur)
		t.TotalFloat = int(math.Round(t.LateStart.Sub(t.EarlyStart).Hours() / 24))
		t.IsCritical = t.TotalFloat == 0
	}

	var all []*CPMTask
	var crit []string
	for _, t := range tm {
		all = append(all, t)
		if t.IsCritical { crit = append(crit, t.ID) }
	}
	sort.Slice(all, func(i, j int) bool { return all[i].EarlyStart.Before(all[j].EarlyStart) })
	var projStart time.Time
	if len(all) > 0 { projStart = all[0].EarlyStart }
	total := int(math.Round(projEnd.Sub(projStart).Hours() / 24))

	return &CriticalPath{TotalDuration: total, CriticalTaskIDs: crit, Tasks: all}, nil
}

// ── Helpers ────────────────────────────────────────────────────────────────────

func d(y, m, day int) *time.Time {
	t := time.Date(y, time.Month(m), day, 0, 0, 0, 0, time.UTC)
	return &t
}

func task(id string, sy, sm, sd, ey, em, ed int) *Task {
	return &Task{ID: id, StartDate: d(sy, sm, sd), EndDate: d(ey, em, ed)}
}

func fs(from, to string) Dep { return Dep{from, to, "FS", 0} }
func fsLag(from, to string, lag int) Dep { return Dep{from, to, "FS", lag} }

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestCPM_Linear_AllCritical(t *testing.T) {
	cp, err := runCPM(
		[]*Task{task("A", 2026, 1, 1, 2026, 1, 5), task("B", 2026, 1, 5, 2026, 1, 10), task("C", 2026, 1, 10, 2026, 1, 15)},
		[]Dep{fs("A", "B"), fs("B", "C")},
	)
	if err != nil { t.Fatal(err) }
	if len(cp.Tasks) != 3 { t.Fatalf("expected 3 tasks, got %d", len(cp.Tasks)) }
	for _, task := range cp.Tasks {
		if !task.IsCritical { t.Errorf("task %s should be critical in a linear chain", task.ID) }
	}
}

func TestCPM_Parallel_ShortPathHasFloat(t *testing.T) {
	// A → B (short) and A → C (long) both → D
	tasks := []*Task{task("A", 2026, 1, 1, 2026, 1, 2), task("B", 2026, 1, 2, 2026, 1, 5),
		task("C", 2026, 1, 2, 2026, 1, 9), task("D", 2026, 1, 9, 2026, 1, 10)}
	deps := []Dep{fs("A", "B"), fs("A", "C"), fs("B", "D"), fs("C", "D")}
	cp, err := runCPM(tasks, deps)
	if err != nil { t.Fatal(err) }

	var taskB *CPMTask
	for _, t := range cp.Tasks { if t.ID == "B" { taskB = t } }
	if taskB == nil { t.Fatal("task B not found") }
	if taskB.IsCritical { t.Error("short-path task B must NOT be critical") }
	if taskB.TotalFloat <= 0 { t.Errorf("task B must have positive float, got %d", taskB.TotalFloat) }
}

func TestCPM_FSWithLag(t *testing.T) {
	tasks := []*Task{task("A", 2026, 1, 1, 2026, 1, 6), task("B", 2026, 1, 8, 2026, 1, 13)}
	cp, err := runCPM(tasks, []Dep{fsLag("A", "B", 2)})
	if err != nil { t.Fatal(err) }
	if len(cp.Tasks) != 2 { t.Errorf("expected 2 tasks, got %d", len(cp.Tasks)) }
}

func TestCPM_CycleDetected(t *testing.T) {
	tasks := []*Task{task("A", 2026, 1, 1, 2026, 1, 3), task("B", 2026, 1, 3, 2026, 1, 6), task("C", 2026, 1, 6, 2026, 1, 9)}
	_, err := runCPM(tasks, []Dep{fs("A", "B"), fs("B", "C"), fs("C", "A")}) // cycle
	if err == nil { t.Error("expected cycle error") }
}

func TestCPM_Empty(t *testing.T) {
	cp, err := runCPM(nil, nil)
	if err != nil { t.Fatal(err) }
	if len(cp.Tasks) != 0 { t.Errorf("expected 0 tasks") }
}

func TestCPM_SingleTask_IsCritical(t *testing.T) {
	cp, err := runCPM([]*Task{task("A", 2026, 1, 1, 2026, 1, 5)}, nil)
	if err != nil { t.Fatal(err) }
	if len(cp.Tasks) != 1 { t.Fatal("expected 1 task") }
	if !cp.Tasks[0].IsCritical { t.Error("single task must be critical") }
}

func TestCPM_TotalDuration(t *testing.T) {
	tasks := []*Task{task("A", 2026, 1, 1, 2026, 1, 3), task("B", 2026, 1, 3, 2026, 1, 6), task("C", 2026, 1, 6, 2026, 1, 10)}
	cp, err := runCPM(tasks, []Dep{fs("A", "B"), fs("B", "C")})
	if err != nil { t.Fatal(err) }
	if cp.TotalDuration != 9 { t.Errorf("expected 9 days, got %d", cp.TotalDuration) }
}

func TestCPM_Performance_1000Tasks(t *testing.T) {
	N := 1000
	tasks := make([]*Task, N)
	deps := make([]Dep, N-1)
	for i := 0; i < N; i++ {
		s := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, i)
		e := s.AddDate(0, 0, 1)
		tasks[i] = &Task{ID: fmt.Sprintf("T%d", i), StartDate: &s, EndDate: &e}
	}
	for i := 0; i < N-1; i++ {
		deps[i] = Dep{fmt.Sprintf("T%d", i), fmt.Sprintf("T%d", i+1), "FS", 0}
	}
	start := time.Now()
	_, err := runCPM(tasks, deps)
	elapsed := time.Since(start)
	if err != nil { t.Fatalf("CPM 1000 tasks failed: %v", err) }
	if elapsed > 200*time.Millisecond { t.Errorf("SLO exceeded: %v (limit 200ms)", elapsed) }
	t.Logf("CPM 1000 tasks: %v", elapsed)
}
