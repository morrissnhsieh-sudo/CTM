// M5 — Project Management Service
// Unit tests: Workflow trigger condition evaluator (go-expr)
//
// Spec refs:
//   - Conditions: boolean go-expr expressions over column values
//   - Example: Status == "Done" AND Priority == "High"
//   - Numeric: Amount > 10000
//   - Event type filter: event_type == "row_created"
//   - Invalid expressions return compile error
//   - SLO: trigger eval p99 < 100ms

package trigger_test

import (
	"testing"
	"time"

	"github.com/expr-lang/expr"
)

// ── Trigger context ────────────────────────────────────────────────────────────

type TriggerCtx struct {
	EventType string                 `expr:"event_type"`
	SheetID   string                 `expr:"sheet_id"`
	RowID     string                 `expr:"row_id"`
	Columns   map[string]interface{} `expr:"columns"`
}

func eval(condition string, ctx *TriggerCtx) (bool, error) {
	if condition == "" || condition == "true" { return true, nil }
	env := map[string]interface{}{
		"event_type": ctx.EventType, "sheet_id": ctx.SheetID,
		"row_id": ctx.RowID, "columns": ctx.Columns,
	}
	prog, err := expr.Compile(condition, expr.Env(env), expr.AsBool())
	if err != nil { return false, err }
	out, err := expr.Run(prog, env)
	if err != nil { return false, err }
	return out.(bool), nil
}

func ctx(eventType string, cols map[string]interface{}) *TriggerCtx {
	return &TriggerCtx{EventType: eventType, SheetID: "s1", RowID: "r1", Columns: cols}
}

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestTrigger_EmptyCondition_True(t *testing.T) {
	r, err := eval("", ctx("row_updated", nil))
	if err != nil || !r { t.Errorf("empty condition should return true, got err=%v r=%v", err, r) }
}

func TestTrigger_LiteralTrue(t *testing.T) {
	r, err := eval("true", ctx("row_created", nil))
	if err != nil || !r { t.Errorf("literal true should return true") }
}

func TestTrigger_LiteralFalse(t *testing.T) {
	r, err := eval("false", ctx("row_created", nil))
	if err != nil || r { t.Errorf("literal false should return false") }
}

func TestTrigger_StatusEquals_Done(t *testing.T) {
	r, err := eval(`columns["Status"] == "Done"`, ctx("row_updated", map[string]interface{}{"Status": "Done"}))
	if err != nil { t.Fatalf("eval error: %v", err) }
	if !r { t.Error("should be true when Status == Done") }
}

func TestTrigger_StatusNotDone_False(t *testing.T) {
	r, err := eval(`columns["Status"] == "Done"`, ctx("row_updated", map[string]interface{}{"Status": "In Progress"}))
	if err != nil { t.Fatalf("eval error: %v", err) }
	if r { t.Error("should be false when Status != Done") }
}

func TestTrigger_AND_BothMustMatch(t *testing.T) {
	cond := `columns["Status"] == "Done" && columns["Priority"] == "High"`
	r1, _ := eval(cond, ctx("row_updated", map[string]interface{}{"Status": "Done", "Priority": "High"}))
	if !r1 { t.Error("AND: both match should return true") }
	r2, _ := eval(cond, ctx("row_updated", map[string]interface{}{"Status": "Done", "Priority": "Low"}))
	if r2 { t.Error("AND: one mismatch should return false") }
}

func TestTrigger_OR_EitherMatches(t *testing.T) {
	cond := `columns["Status"] == "Done" || columns["Status"] == "Cancelled"`
	r1, _ := eval(cond, ctx("row_updated", map[string]interface{}{"Status": "Done"}))
	r2, _ := eval(cond, ctx("row_updated", map[string]interface{}{"Status": "Cancelled"}))
	r3, _ := eval(cond, ctx("row_updated", map[string]interface{}{"Status": "Pending"}))
	if !r1 { t.Error("OR: Done should match") }
	if !r2 { t.Error("OR: Cancelled should match") }
	if r3 { t.Error("OR: Pending should NOT match") }
}

func TestTrigger_NumericComparison(t *testing.T) {
	cond := `columns["Amount"] > 10000`
	rHigh, _ := eval(cond, ctx("row_updated", map[string]interface{}{"Amount": 15000}))
	rLow,  _ := eval(cond, ctx("row_updated", map[string]interface{}{"Amount": 5000}))
	if !rHigh { t.Error("15000 > 10000 should be true") }
	if rLow   { t.Error("5000 > 10000 should be false") }
}

func TestTrigger_ExactAmount_Boundary(t *testing.T) {
	cond := `columns["Amount"] >= 10000`
	rExact, _ := eval(cond, ctx("row_updated", map[string]interface{}{"Amount": 10000}))
	if !rExact { t.Error("exactly 10000 should satisfy >= 10000") }
}

func TestTrigger_EventTypeFilter(t *testing.T) {
	cond := `event_type == "row_created"`
	rMatch,    _ := eval(cond, ctx("row_created", nil))
	rNoMatch,  _ := eval(cond, ctx("row_updated", nil))
	if !rMatch   { t.Error("should match row_created") }
	if rNoMatch  { t.Error("should NOT match row_updated") }
}

func TestTrigger_InvalidExpression_ReturnsError(t *testing.T) {
	_, err := eval("this is not valid !!!", ctx("row_updated", nil))
	if err == nil { t.Error("invalid expression should return compile error") }
}

func TestTrigger_NestedColumns(t *testing.T) {
	// Complex: amount > threshold AND status matches
	cond := `columns["Amount"] > 5000 && columns["Status"] == "Approved"`
	cols := map[string]interface{}{"Amount": 7500, "Status": "Approved"}
	r, err := eval(cond, ctx("row_updated", cols))
	if err != nil { t.Fatal(err) }
	if !r { t.Error("complex condition should return true") }
}

func TestTrigger_Performance_100EvalUnder100ms(t *testing.T) {
	cond := `columns["Status"] == "Done" && columns["Amount"] > 1000`
	ctx := ctx("row_updated", map[string]interface{}{"Status": "Done", "Amount": 5000})
	start := time.Now()
	for i := 0; i < 100; i++ {
		if _, err := eval(cond, ctx); err != nil { t.Fatal(err) }
	}
	elapsed := time.Since(start)
	perCall := elapsed / 100
	if perCall > 100*time.Millisecond { t.Errorf("SLO exceeded: %v per call (limit 100ms)", perCall) }
	t.Logf("100 trigger evals: total=%v, per-call=%v", elapsed, perCall)
}
