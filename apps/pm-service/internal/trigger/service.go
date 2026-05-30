// Package trigger evaluates workflow trigger conditions and dispatches actions.
package trigger

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/ctm/pm-service/internal/kafka"
	"github.com/ctm/pm-service/internal/repository"
	"github.com/expr-lang/expr"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

type Service struct {
	repo      repository.TriggerRepository
	publisher *kafka.Publisher
	log       *zap.Logger
}

func NewService(repo repository.TriggerRepository, publisher *kafka.Publisher, log *zap.Logger) *Service {
	return &Service{repo: repo, publisher: publisher, log: log}
}

// TriggerContext is the evaluation environment passed to go-expr.
type TriggerContext struct {
	EventType string                 `expr:"event_type"`
	SheetID   string                 `expr:"sheet_id"`
	RowID     string                 `expr:"row_id"`
	UserID    string                 `expr:"user_id"`
	Columns   map[string]interface{} `expr:"columns"` // column_name → value
}

// EvaluateForRow checks all enabled triggers for a sheet against a row event.
// Called by the Kafka consumer on ctm.rows events.
func (s *Service) EvaluateForRow(ctx context.Context, sheetID string, event *TriggerContext) error {
	triggers, err := s.repo.ListEnabledTriggers(ctx, sheetID)
	if err != nil {
		return fmt.Errorf("listing triggers: %w", err)
	}

	for _, trig := range triggers {
		// Check event type matches
		if trig.EventType != event.EventType && trig.EventType != "row_updated" {
			continue
		}

		// Evaluate condition using go-expr
		matched, err := s.evaluateCondition(trig.Conditions, event)
		if err != nil {
			s.log.Warn("trigger condition eval error",
				zap.String("triggerId", trig.ID),
				zap.Error(err),
			)
			continue
		}

		if !matched {
			continue
		}

		// Dispatch actions
		for _, action := range trig.Actions {
			if err := s.dispatchAction(ctx, trig, event, action); err != nil {
				s.log.Error("trigger action dispatch failed",
					zap.String("triggerId", trig.ID),
					zap.String("actionType", action.Type),
					zap.Error(err),
				)
			}
		}

		// Update last_fired_at
		if err := s.repo.UpdateLastFired(ctx, trig.ID); err != nil {
			s.log.Error("failed to update last_fired_at", zap.Error(err))
		}
	}

	return nil
}

func (s *Service) evaluateCondition(condition string, ctx *TriggerContext) (bool, error) {
	if condition == "" || condition == "true" {
		return true, nil
	}

	env := map[string]interface{}{
		"event_type": ctx.EventType,
		"sheet_id":   ctx.SheetID,
		"row_id":     ctx.RowID,
		"user_id":    ctx.UserID,
		"columns":    ctx.Columns,
	}

	// Compile and run using expr-lang
	prog, err := expr.Compile(condition, expr.Env(env), expr.AsBool())
	if err != nil {
		return false, fmt.Errorf("compiling condition %q: %w", condition, err)
	}

	output, err := expr.Run(prog, env)
	if err != nil {
		return false, fmt.Errorf("running condition: %w", err)
	}

	result, ok := output.(bool)
	if !ok {
		return false, fmt.Errorf("condition did not return bool")
	}

	return result, nil
}

func (s *Service) dispatchAction(
	ctx context.Context,
	trig *repository.WorkflowTrigger,
	event *TriggerContext,
	action repository.TriggerAction,
) error {
	s.log.Info("dispatching trigger action",
		zap.String("type", action.Type),
		zap.String("triggerId", trig.ID),
	)

	payload := map[string]interface{}{
		"eventId":     uuid.New().String(),
		"type":        "workflow.triggered",
		"timestamp":   time.Now().UnixMilli(),
		"workspaceId": "",
		"userId":      event.UserID,
		"sheetId":     event.SheetID,
		"triggerId":   trig.ID,
		"rowId":       event.RowID,
		"actionType":  action.Type,
		"config":      action.Config,
	}

	configJSON, _ := json.Marshal(action.Config)

	switch action.Type {
	case "send_notification", "call_webhook":
		// Publish to ctm.workflows for M7 to consume
		return s.publisher.Publish(ctx, "ctm.workflows", trig.ID, payload)

	case "run_ai_agent":
		// Publish to ctm.ai.jobs for M6 to consume
		payload["formula"] = ""
		payload["cellRef"] = ""
		payload["contextRange"] = nil
		return s.publisher.Publish(ctx, "ctm.ai.jobs", trig.ID, payload)

	case "update_cell":
		// Publish to ctm.workflows for M3/M2 to handle
		_ = configJSON
		return s.publisher.Publish(ctx, "ctm.workflows", trig.ID, payload)

	default:
		return s.publisher.Publish(ctx, "ctm.workflows", trig.ID, payload)
	}
}
