// Package approval implements finite state machine (FSM) based approval chains.
package approval

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/ctm/pm-service/internal/kafka"
	"github.com/ctm/pm-service/internal/repository"
	"github.com/google/uuid"
	"github.com/looplab/fsm"
	"go.uber.org/zap"
)

// State constants
const (
	StateDraft     = "DRAFT"
	StatePending   = "PENDING"
	StateInReview  = "IN_REVIEW"
	StateApproved  = "APPROVED"
	StateRejected  = "REJECTED"
	StateEscalated = "ESCALATED"
)

// Event constants
const (
	EventSubmit   = "submit"
	EventApprove  = "approve"
	EventReject   = "reject"
	EventEscalate = "escalate"
	EventReopen   = "reopen"
)

// ApprovalStep defines a single step in the workflow.
type ApprovalStep struct {
	Order        int    `json:"order"`
	ApproverType string `json:"approverType"` // user|role|group
	ApproverID   string `json:"approverId"`
	Condition    string `json:"condition,omitempty"`
	Mode         string `json:"mode"` // sequential|any_of
	MinApprovals int    `json:"minApprovals,omitempty"`
}

// WorkflowDef defines the complete approval workflow.
type WorkflowDef struct {
	Steps             []ApprovalStep `json:"steps"`
	SLAHours          int            `json:"slaHours"`
	EscalationUserID  *string        `json:"escalationUserId,omitempty"`
}

// HistoryEntry records a single approval action.
type HistoryEntry struct {
	Action    string    `json:"action"`
	UserID    string    `json:"userId"`
	Note      string    `json:"note,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

type Service struct {
	repo      repository.ApprovalRepository
	publisher *kafka.Publisher
	log       *zap.Logger
}

func NewService(repo repository.ApprovalRepository, publisher *kafka.Publisher, log *zap.Logger) *Service {
	return &Service{repo: repo, publisher: publisher, log: log}
}

// CreateFSM builds a looplab/fsm state machine for an approval workflow.
func (s *Service) CreateFSM(currentState string, approvalID string, callbacks FSMCallbacks) *fsm.FSM {
	return fsm.NewFSM(
		currentState,
		fsm.Events{
			{Name: EventSubmit,   Src: []string{StateDraft},                        Dst: StatePending},
			{Name: EventApprove,  Src: []string{StatePending, StateInReview},        Dst: StateApproved},
			{Name: EventReject,   Src: []string{StatePending, StateInReview},        Dst: StateRejected},
			{Name: EventEscalate, Src: []string{StatePending, StateInReview},        Dst: StateEscalated},
			{Name: EventReopen,   Src: []string{StateRejected, StateEscalated},      Dst: StatePending},
		},
		fsm.Callbacks{
			"after_event": func(ctx context.Context, e *fsm.Event) {
				callbacks.OnStateChange(ctx, approvalID, e.Dst, e.Event)
			},
		},
	)
}

type FSMCallbacks struct {
	OnStateChange func(ctx context.Context, approvalID, newState, event string)
}

// Submit transitions an approval from DRAFT → PENDING.
func (s *Service) Submit(ctx context.Context, approvalID, userID string) error {
	return s.transition(ctx, approvalID, userID, EventSubmit, "")
}

// Approve records an approval decision.
func (s *Service) Approve(ctx context.Context, approvalID, userID, note string) error {
	return s.transition(ctx, approvalID, userID, EventApprove, note)
}

// Reject records a rejection.
func (s *Service) Reject(ctx context.Context, approvalID, userID, note string) error {
	return s.transition(ctx, approvalID, userID, EventReject, note)
}

// Escalate escalates due to SLA breach.
func (s *Service) Escalate(ctx context.Context, approvalID, userID string) error {
	return s.transition(ctx, approvalID, userID, EventEscalate, "SLA breach")
}

func (s *Service) transition(ctx context.Context, approvalID, userID, event, note string) error {
	rec, err := s.repo.GetApproval(ctx, approvalID)
	if err != nil {
		return fmt.Errorf("getting approval: %w", err)
	}

	m := s.CreateFSM(rec.CurrentState, approvalID, FSMCallbacks{
		OnStateChange: func(ctx context.Context, id, state, evt string) {
			s.log.Info("approval state changed",
				zap.String("approvalId", id),
				zap.String("state", state),
				zap.String("event", evt),
			)
		},
	})

	if err := m.Event(ctx, event); err != nil {
		return fmt.Errorf("FSM transition %s: %w", event, err)
	}

	newState := m.Current()

	entry := HistoryEntry{
		Action:    event,
		UserID:    userID,
		Note:      note,
		Timestamp: time.Now(),
	}
	entryJSON, _ := json.Marshal(entry)

	if err := s.repo.UpdateApproval(ctx, &repository.ApprovalUpdate{
		ID:           approvalID,
		CurrentState: newState,
		HistoryEntry: entryJSON,
	}); err != nil {
		return fmt.Errorf("updating approval: %w", err)
	}

	// Publish event to Kafka ctm.approvals
	eventType := "approval.completed"
	if newState == StatePending || newState == StateInReview {
		eventType = "approval.requested"
	}

	if err := s.publisher.Publish(ctx, "ctm.approvals", approvalID, map[string]interface{}{
		"eventId":    uuid.New().String(),
		"type":       eventType,
		"approvalId": approvalID,
		"decision":   newState,
		"userId":     userID,
		"timestamp":  time.Now().UnixMilli(),
	}); err != nil {
		s.log.Error("failed to publish approval event", zap.Error(err))
	}

	return nil
}

// CreateApproval initialises a new approval workflow for a row.
func (s *Service) CreateApproval(
	ctx context.Context,
	rowID, sheetID string,
	workflowDef WorkflowDef,
) (*repository.Approval, error) {
	defJSON, _ := json.Marshal(workflowDef)

	approval := &repository.Approval{
		ID:           uuid.New().String(),
		RowID:        rowID,
		SheetID:      sheetID,
		WorkflowDef:  defJSON,
		CurrentState: StateDraft,
	}

	if err := s.repo.CreateApproval(ctx, approval); err != nil {
		return nil, fmt.Errorf("creating approval: %w", err)
	}

	return approval, nil
}
