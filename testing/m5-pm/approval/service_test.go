// M5 — Project Management Service
// Unit tests: Approval FSM — self-contained using looplab/fsm
//
// Spec refs:
//   - States: DRAFT → PENDING → IN_REVIEW → APPROVED | REJECTED | ESCALATED
//   - Events: submit, approve, reject, escalate, reopen
//   - Invalid transitions return an error (no state change)
//   - SLO: FSM transition p99 < 30ms

package approval_test

import (
	"context"
	"testing"
	"time"

	"github.com/looplab/fsm"
)

// ── State and event constants ──────────────────────────────────────────────────

const (
	Draft     = "DRAFT"
	Pending   = "PENDING"
	InReview  = "IN_REVIEW"
	Approved  = "APPROVED"
	Rejected  = "REJECTED"
	Escalated = "ESCALATED"
)

// ── Factory: create a new approval FSM ────────────────────────────────────────

func newApprovalFSM(initialState string) *fsm.FSM {
	return fsm.NewFSM(
		initialState,
		fsm.Events{
			{Name: "submit",   Src: []string{Draft},              Dst: Pending},
			{Name: "approve",  Src: []string{Pending, InReview},  Dst: Approved},
			{Name: "reject",   Src: []string{Pending, InReview},  Dst: Rejected},
			{Name: "escalate", Src: []string{Pending, InReview},  Dst: Escalated},
			{Name: "reopen",   Src: []string{Rejected, Escalated}, Dst: Pending},
		},
		fsm.Callbacks{},
	)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestFSM_InitialState(t *testing.T) {
	m := newApprovalFSM(Draft)
	if m.Current() != Draft { t.Errorf("expected DRAFT, got %s", m.Current()) }
}

func TestFSM_Submit_DraftToPending(t *testing.T) {
	m := newApprovalFSM(Draft)
	if err := m.Event(context.Background(), "submit"); err != nil {
		t.Fatalf("submit failed: %v", err)
	}
	if m.Current() != Pending { t.Errorf("expected PENDING, got %s", m.Current()) }
}

func TestFSM_Approve_PendingToApproved(t *testing.T) {
	m := newApprovalFSM(Pending)
	if err := m.Event(context.Background(), "approve"); err != nil { t.Fatal(err) }
	if m.Current() != Approved { t.Errorf("expected APPROVED, got %s", m.Current()) }
}

func TestFSM_Reject_PendingToRejected(t *testing.T) {
	m := newApprovalFSM(Pending)
	if err := m.Event(context.Background(), "reject"); err != nil { t.Fatal(err) }
	if m.Current() != Rejected { t.Errorf("expected REJECTED, got %s", m.Current()) }
}

func TestFSM_Escalate_PendingToEscalated(t *testing.T) {
	m := newApprovalFSM(Pending)
	if err := m.Event(context.Background(), "escalate"); err != nil { t.Fatal(err) }
	if m.Current() != Escalated { t.Errorf("expected ESCALATED, got %s", m.Current()) }
}

func TestFSM_Reopen_RejectedToPending(t *testing.T) {
	m := newApprovalFSM(Rejected)
	if err := m.Event(context.Background(), "reopen"); err != nil { t.Fatal(err) }
	if m.Current() != Pending { t.Errorf("expected PENDING after reopen, got %s", m.Current()) }
}

func TestFSM_Reopen_EscalatedToPending(t *testing.T) {
	m := newApprovalFSM(Escalated)
	if err := m.Event(context.Background(), "reopen"); err != nil { t.Fatal(err) }
	if m.Current() != Pending { t.Errorf("expected PENDING after reopen from ESCALATED, got %s", m.Current()) }
}

func TestFSM_InvalidTransition_DraftToApproved(t *testing.T) {
	m := newApprovalFSM(Draft)
	err := m.Event(context.Background(), "approve") // invalid: Draft → Approved
	if err == nil { t.Error("expected error for invalid DRAFT→APPROVED transition") }
	if m.Current() != Draft { t.Errorf("state must not change after invalid transition, got %s", m.Current()) }
}

func TestFSM_InvalidTransition_ApprovedIsTerminal(t *testing.T) {
	m := newApprovalFSM(Approved)
	for _, event := range []string{"submit", "approve", "reject", "escalate", "reopen"} {
		err := m.Event(context.Background(), event)
		if err == nil { t.Errorf("APPROVED must be terminal — %s should fail", event) }
		if m.Current() != Approved { t.Errorf("state changed unexpectedly from APPROVED via %s", event) }
	}
}

func TestFSM_FullWorkflow_DraftToApproved(t *testing.T) {
	m := newApprovalFSM(Draft)
	steps := []struct{ event, expected string }{
		{"submit",  Pending},
		{"approve", Approved},
	}
	for _, step := range steps {
		if err := m.Event(context.Background(), step.event); err != nil {
			t.Fatalf("event %s failed: %v", step.event, err)
		}
		if m.Current() != step.expected {
			t.Errorf("after %s: expected %s, got %s", step.event, step.expected, m.Current())
		}
	}
}

func TestFSM_FullWorkflow_WithEscalationAndReopen(t *testing.T) {
	m := newApprovalFSM(Draft)
	transitions := []string{"submit", "escalate", "reopen", "approve"}
	expected := []string{Pending, Escalated, Pending, Approved}
	for i, ev := range transitions {
		if err := m.Event(context.Background(), ev); err != nil { t.Fatalf("step %d (%s) failed: %v", i, ev, err) }
		if m.Current() != expected[i] { t.Errorf("step %d: expected %s, got %s", i, expected[i], m.Current()) }
	}
}

func TestFSM_CanTransition_Queries(t *testing.T) {
	m := newApprovalFSM(Draft)
	if !m.Can("submit")  { t.Error("DRAFT should allow submit") }
	if m.Can("approve")  { t.Error("DRAFT should NOT allow approve") }
	if m.Can("reject")   { t.Error("DRAFT should NOT allow reject") }
}

func TestFSM_Performance_Transition(t *testing.T) {
	// SLO: FSM transition p99 < 30ms
	m := newApprovalFSM(Draft)
	start := time.Now()
	_ = m.Event(context.Background(), "submit")
	elapsed := time.Since(start)
	if elapsed > 30*time.Millisecond { t.Errorf("FSM SLO exceeded: %v (limit 30ms)", elapsed) }
}
