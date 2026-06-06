package http

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/ctm/pm-service/internal/approval"
	"github.com/ctm/pm-service/internal/cpm"
	"github.com/ctm/pm-service/internal/repository"
	"github.com/ctm/pm-service/internal/trigger"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// NewRouter creates the HTTP/REST router for the PM service.
// This is used by M3 API Gateway to proxy PM operations.
func NewRouter(
	taskRepo repository.TaskRepository,
	projectRepo repository.ProjectRepository,
	cpmSvc *cpm.Service,
	approvalSvc *approval.Service,
	triggerSvc *trigger.Service,
	timeRepo repository.TimeRepository,
	allocRepo repository.ResourceAllocationRepository,
	baselineRepo repository.BaselineRepository,
	log *zap.Logger,
) http.Handler {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	// ─── Middleware ───────────────────────────────────────────
	r.Use(func(c *gin.Context) {
		workspaceID := c.GetHeader("X-Workspace-Id")
		userID := c.GetHeader("X-User-Id")
		role := c.GetHeader("X-User-Role")

		if workspaceID == "" || userID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing auth headers"})
			c.Abort()
			return
		}

		c.Set("workspaceId", workspaceID)
		c.Set("userId", userID)
		c.Set("role", role)
		c.Next()
	})

	v1 := r.Group("/v1")

	// ─── Projects ────────────────────────────────────────────
	v1.GET("/projects", func(c *gin.Context) {
		workspaceID := c.GetString("workspaceId")
		userID := c.GetString("userId")
		role := c.GetString("role")

		// Admins and Owners see all projects; PjMs see only their own.
		var (
			projects []*repository.Project
			err      error
		)
		if role == "ADMIN" || role == "OWNER" {
			projects, err = projectRepo.ListWorkspaceProjects(c.Request.Context(), workspaceID)
		} else {
			projects, err = projectRepo.ListOwnedProjects(c.Request.Context(), workspaceID, userID)
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": projects})
	})

	v1.POST("/projects", func(c *gin.Context) {
		var body struct {
			Name   string `json:"name" binding:"required"`
			Status string `json:"status"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		userID := c.GetString("userId")
		project := &repository.Project{
			ID:          uuid.New().String(),
			WorkspaceID: c.GetString("workspaceId"),
			Name:        body.Name,
			Status:      "active",
			CreatedBy:   &userID,
		}
		if err := projectRepo.CreateProject(c.Request.Context(), project); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"data": project})
	})

	// ─── Tasks ───────────────────────────────────────────────
	v1.GET("/projects/:projectId/tasks", func(c *gin.Context) {
		tasks, err := taskRepo.ListProjectTasks(c.Request.Context(), c.Param("projectId"))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": tasks})
	})

	v1.POST("/projects/:projectId/tasks", func(c *gin.Context) {
		var body struct {
			SheetID    string `json:"sheetId" binding:"required"`
			RowID      string `json:"rowId" binding:"required"`
			Name       string `json:"name"`
			StartDate  string `json:"startDate"`
			EndDate    string `json:"endDate"`
			AssigneeID string `json:"assigneeId"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		task := &repository.Task{
			ID:        uuid.New().String(),
			ProjectID: c.Param("projectId"),
			SheetID:   body.SheetID,
			RowID:     body.RowID,
			Name:      body.Name,
		}

		if err := taskRepo.CreateTask(c.Request.Context(), task); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"data": task})
	})

	v1.PUT("/projects/:projectId/tasks/:taskId", func(c *gin.Context) {
		projectID := c.Param("projectId")
		taskID := c.Param("taskId")

		var body struct {
			Name         *string `json:"name"`
			StartDate    *string `json:"startDate"`
			EndDate      *string `json:"endDate"`
			AssigneeID   *string `json:"assigneeId"`
			Status       *string `json:"status"`
			IsMilestone  *bool   `json:"isMilestone"`
			Predecessors *string `json:"predecessors"`
		}

		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		task, err := taskRepo.GetTask(c.Request.Context(), taskID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
			return
		}

		if body.Name != nil {
			task.Name = *body.Name
		}
		if body.AssigneeID != nil {
			if *body.AssigneeID == "" {
				task.AssigneeID = nil
			} else {
				task.AssigneeID = body.AssigneeID
			}
		}
		if body.Status != nil {
			task.Status = *body.Status
		}
		if body.IsMilestone != nil {
			task.IsMilestone = *body.IsMilestone
		}

		if body.StartDate != nil {
			if *body.StartDate == "" {
				task.StartDate = nil
			} else if parsed, err := time.Parse("2006-01-02", *body.StartDate); err == nil {
				task.StartDate = &parsed
			} else {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid startDate format"})
				return
			}
		}
		if body.EndDate != nil {
			if *body.EndDate == "" {
				task.EndDate = nil
			} else if parsed, err := time.Parse("2006-01-02", *body.EndDate); err == nil {
				task.EndDate = &parsed
			} else {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid endDate format"})
				return
			}
		}

		if task.StartDate != nil && task.EndDate != nil && task.StartDate.After(*task.EndDate) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "startDate cannot be after endDate"})
			return
		}

		if task.StartDate != nil && task.EndDate != nil {
			task.DurationDays = int(task.EndDate.Sub(*task.StartDate).Hours() / 24)
		}

		if body.Predecessors != nil {
			allTasks, err := taskRepo.ListProjectTasks(c.Request.Context(), projectID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}

			indexToUUID := make(map[int]string)
			for i, t := range allTasks {
				indexToUUID[i+1] = t.ID
			}

			parsedDeps, err := cpm.ParsePredecessorString(*body.Predecessors, taskID, indexToUUID)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			if err := taskRepo.ClearTaskDependencies(c.Request.Context(), taskID); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}

			for _, d := range parsedDeps {
				d.ID = uuid.New().String()
				if err := taskRepo.CreateDependency(c.Request.Context(), d); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
			}
		}

		if err := taskRepo.UpdateTask(c.Request.Context(), task); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		cp, err := cpmSvc.Compute(c.Request.Context(), projectID)
		if err != nil {
			if strings.Contains(err.Error(), "cycle") {
				c.JSON(http.StatusBadRequest, gin.H{"error": "cycle detected in task dependencies"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		var dbTasks []*repository.Task
		for _, ct := range cp.Tasks {
			start := ct.EarlyStart
			end := ct.EarlyFinish
			ct.Task.StartDate = &start
			ct.Task.EndDate = &end
			ct.Task.IsCritical = ct.IsCritical
			ct.Task.FloatDays = &ct.TotalFloat
			dbTasks = append(dbTasks, ct.Task)
		}

		if err := taskRepo.UpdateCPMResults(c.Request.Context(), projectID, dbTasks); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"data": task})
	})

	v1.DELETE("/projects/:projectId/tasks/:taskId/dependencies/:depId", func(c *gin.Context) {
		depID := c.Param("depId")
		projectID := c.Param("projectId")
		if err := taskRepo.DeleteDependency(c.Request.Context(), depID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		cp, err := cpmSvc.Compute(c.Request.Context(), projectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		var dbTasks []*repository.Task
		for _, ct := range cp.Tasks {
			start := ct.EarlyStart
			end := ct.EarlyFinish
			ct.Task.StartDate = &start
			ct.Task.EndDate = &end
			ct.Task.IsCritical = ct.IsCritical
			ct.Task.FloatDays = &ct.TotalFloat
			dbTasks = append(dbTasks, ct.Task)
		}

		if err := taskRepo.UpdateCPMResults(c.Request.Context(), projectID, dbTasks); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.Status(http.StatusNoContent)
	})


	// ─── CPM ─────────────────────────────────────────────────
	v1.GET("/projects/:projectId/critical-path", func(c *gin.Context) {
		cp, err := cpmSvc.Compute(c.Request.Context(), c.Param("projectId"))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": cp})
	})

	// ─── Cascade, Baselines & Templates ───────────────────────
	v1.POST("/projects/:projectId/tasks/:taskId/cascade", func(c *gin.Context) {
		projectID := c.Param("projectId")
		taskID := c.Param("taskId")

		var body struct {
			StartDate  *string `json:"startDate"`
			EndDate    *string `json:"endDate"`
			FinishDate *string `json:"finishDate"`
		}

		if err := c.ShouldBindJSON(&body); err != nil {
			if err.Error() != "EOF" {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
		}

		task, err := taskRepo.GetTask(c.Request.Context(), taskID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
			return
		}

		updated := false
		if body.StartDate != nil && *body.StartDate != "" {
			if parsed, err := time.Parse("2006-01-02", *body.StartDate); err == nil {
				task.StartDate = &parsed
				updated = true
			} else {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid startDate format"})
				return
			}
		}

		endDateStr := body.EndDate
		if endDateStr == nil {
			endDateStr = body.FinishDate
		}
		if endDateStr != nil && *endDateStr != "" {
			if parsed, err := time.Parse("2006-01-02", *endDateStr); err == nil {
				task.EndDate = &parsed
				updated = true
			} else {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid endDate/finishDate format"})
				return
			}
		}

		if task.StartDate != nil && task.EndDate != nil && task.StartDate.After(*task.EndDate) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "startDate cannot be after endDate"})
			return
		}

		if task.StartDate != nil && task.EndDate != nil {
			task.DurationDays = int(task.EndDate.Sub(*task.StartDate).Hours() / 24)
		}

		if updated {
			if err := taskRepo.UpdateTask(c.Request.Context(), task); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		}

		cp, err := cpmSvc.Compute(c.Request.Context(), projectID)
		if err != nil {
			if strings.Contains(err.Error(), "cycle") {
				c.JSON(http.StatusBadRequest, gin.H{"error": "cycle detected in task dependencies"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"data": gin.H{
				"updatedTasks": cp.Tasks,
				"criticalPath": gin.H{
					"taskIds":       cp.CriticalTaskIDs,
					"totalDuration": cp.TotalDuration,
				},
			},
		})
	})

	v1.GET("/projects/:projectId/baselines", func(c *gin.Context) {
		projectID := c.Param("projectId")
		baselines, err := baselineRepo.ListBaselines(c.Request.Context(), projectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": baselines})
	})

	v1.GET("/projects/:projectId/baselines/:baselineId", func(c *gin.Context) {
		baselineID := c.Param("baselineId")
		baseline, err := baselineRepo.GetBaseline(c.Request.Context(), baselineID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "baseline not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": baseline})
	})

	v1.POST("/projects/:projectId/baseline", func(c *gin.Context) {
		projectID := c.Param("projectId")
		var body struct {
			Name string `json:"name"`
		}
		c.ShouldBindJSON(&body)
		if body.Name == "" {
			body.Name = "Baseline"
		}

		tasks, err := taskRepo.ListProjectTasks(c.Request.Context(), projectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		snapshotJSON, err := json.Marshal(tasks)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		baseline := &repository.Baseline{
			ID:        uuid.New().String(),
			ProjectID: projectID,
			Name:      body.Name,
			Snapshot:  json.RawMessage(snapshotJSON),
			CreatedBy: c.GetString("userId"),
		}

		if err := baselineRepo.CreateBaseline(c.Request.Context(), baseline); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"data": baseline})
	})

	v1.POST("/projects/:projectId/templates/:templateId", func(c *gin.Context) {
		projectID := c.Param("projectId")
		templateID := c.Param("templateId")

		var body struct {
			SheetID string   `json:"sheetId" binding:"required"`
			RowIDs  []string `json:"rowIds" binding:"required"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if len(body.RowIDs) < 5 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "at least 5 rows are required for template injection"})
			return
		}

		// Define template structures
		type TempTask struct {
			offsetDays   int
			durationDays int
			name         string
			predIndices  []int
		}

		var tempTasks []TempTask

		switch templateID {
		case "waterfall":
			tempTasks = []TempTask{
				{offsetDays: 0, durationDays: 5, name: "Requirements", predIndices: []int{}},
				{offsetDays: 5, durationDays: 5, name: "Design", predIndices: []int{0}},
				{offsetDays: 10, durationDays: 10, name: "Build", predIndices: []int{1}},
				{offsetDays: 20, durationDays: 5, name: "Test", predIndices: []int{2}},
				{offsetDays: 25, durationDays: 2, name: "Deploy", predIndices: []int{3}},
			}
		case "sprint":
			tempTasks = []TempTask{
				{offsetDays: 0, durationDays: 1, name: "Sprint Planning", predIndices: []int{}},
				{offsetDays: 1, durationDays: 8, name: "Development", predIndices: []int{0}},
				{offsetDays: 9, durationDays: 1, name: "Sprint Review", predIndices: []int{1}},
				{offsetDays: 10, durationDays: 1, name: "Sprint Retro", predIndices: []int{2}},
				{offsetDays: 11, durationDays: 1, name: "Backlog Grooming", predIndices: []int{3}},
			}
		case "product-launch":
			tempTasks = []TempTask{
				{offsetDays: 0, durationDays: 7, name: "Market Research", predIndices: []int{}},
				{offsetDays: 7, durationDays: 5, name: "Product Specification", predIndices: []int{0}},
				{offsetDays: 12, durationDays: 14, name: "Design & Dev", predIndices: []int{1}},
				{offsetDays: 7, durationDays: 5, name: "Marketing Campaign Planning", predIndices: []int{0}},
				{offsetDays: 26, durationDays: 2, name: "Launch Event", predIndices: []int{2, 3}},
			}
		case "it-infrastructure":
			tempTasks = []TempTask{
				{offsetDays: 0, durationDays: 4, name: "Network Topology Design", predIndices: []int{}},
				{offsetDays: 0, durationDays: 7, name: "Hardware Procurement", predIndices: []int{}},
				{offsetDays: 7, durationDays: 3, name: "Server Provisioning", predIndices: []int{0, 1}},
				{offsetDays: 10, durationDays: 3, name: "Security Hardening", predIndices: []int{2}},
				{offsetDays: 13, durationDays: 2, name: "UAT & Sign-off", predIndices: []int{3}},
			}
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "unknown template type"})
			return
		}

		today := time.Now().Truncate(24 * time.Hour)
		createdTasks := make([]*repository.Task, len(tempTasks))

		for i, tt := range tempTasks {
			start := today.AddDate(0, 0, tt.offsetDays)
			end := start.AddDate(0, 0, tt.durationDays)
			t := &repository.Task{
				ID:           uuid.New().String(),
				ProjectID:    projectID,
				SheetID:      body.SheetID,
				RowID:        body.RowIDs[i],
				Name:         tt.name,
				StartDate:    &start,
				EndDate:      &end,
				DurationDays: tt.durationDays,
				Status:       "Todo",
			}
			if err := taskRepo.CreateTask(c.Request.Context(), t); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			createdTasks[i] = t
		}

		for i, tt := range tempTasks {
			for _, predIdx := range tt.predIndices {
				dep := &repository.Dependency{
					ID:             uuid.New().String(),
					FromTaskID:     createdTasks[predIdx].ID,
					ToTaskID:       createdTasks[i].ID,
					DependencyType: "FS",
					LagDays:        0,
				}
				if err := taskRepo.CreateDependency(c.Request.Context(), dep); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
			}
		}

		_, err := cpmSvc.Compute(c.Request.Context(), projectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		allTasks, err := taskRepo.ListProjectTasks(c.Request.Context(), projectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"data": allTasks})
	})

	// ─── Approvals ────────────────────────────────────────────
	v1.GET("/approvals/:rowId", func(c *gin.Context) {
		a, err := approvalSvc.GetRowApproval(c.Request.Context(), c.Param("rowId"))
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "approval not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": a})
	})

	v1.POST("/approvals/:rowId/submit", func(c *gin.Context) {
		var body struct{ ApprovalID string `json:"approvalId"` }
		c.ShouldBindJSON(&body)
		if err := approvalSvc.Submit(c.Request.Context(), body.ApprovalID, c.GetString("userId")); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	v1.POST("/approvals/:rowId/approve", func(c *gin.Context) {
		var body struct {
			ApprovalID string `json:"approvalId"`
			Note       string `json:"note"`
		}
		c.ShouldBindJSON(&body)
		if err := approvalSvc.Approve(c.Request.Context(), body.ApprovalID, c.GetString("userId"), body.Note); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	v1.POST("/approvals/:rowId/reject", func(c *gin.Context) {
		var body struct {
			ApprovalID string `json:"approvalId"`
			Note       string `json:"note"`
		}
		c.ShouldBindJSON(&body)
		if err := approvalSvc.Reject(c.Request.Context(), body.ApprovalID, c.GetString("userId"), body.Note); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	// ─── Time tracking ────────────────────────────────────────
	v1.POST("/time", func(c *gin.Context) {
		var body struct {
			RowID     string `json:"rowId" binding:"required"`
			Note      string `json:"note"`
			StartedAt string `json:"startedAt"`
			EndedAt   string `json:"endedAt"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		start := time.Now().Add(-8 * time.Hour)
		if body.StartedAt != "" {
			if parsed, err := time.Parse(time.RFC3339, body.StartedAt); err == nil {
				start = parsed
			} else if parsed, err := time.Parse("2006-01-02 15:04:05", body.StartedAt); err == nil {
				start = parsed
			} else if parsed, err := time.Parse("2006-01-02", body.StartedAt); err == nil {
				start = parsed
			}
		}

		var end *time.Time
		now := time.Now()
		end = &now
		if body.EndedAt != "" {
			if parsed, err := time.Parse(time.RFC3339, body.EndedAt); err == nil {
				end = &parsed
			} else if parsed, err := time.Parse("2006-01-02 15:04:05", body.EndedAt); err == nil {
				end = &parsed
			} else if parsed, err := time.Parse("2006-01-02", body.EndedAt); err == nil {
				end = &parsed
			}
		}

		entry := &repository.TimeEntry{
			ID:        uuid.New().String(),
			RowID:     body.RowID,
			UserID:    c.GetString("userId"),
			StartedAt: start,
			EndedAt:   end,
			Note:      body.Note,
		}
		if err := timeRepo.LogTime(c.Request.Context(), entry); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"data": entry})
	})

	// ─── Reports ──────────────────────────────────────────────
	v1.GET("/reports/time-by-project", func(c *gin.Context) {
		projectID := c.Query("projectId")
		total, err := timeRepo.GetProjectTime(c.Request.Context(), projectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"projectId": projectID, "totalSeconds": total}})
	})

	// ─── Resource capacity & allocations ──────────────────────
	v1.GET("/projects/:projectId/resources", func(c *gin.Context) {
		projectID := c.Param("projectId")
		allocations, err := allocRepo.ListProjectAllocations(c.Request.Context(), projectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Calculate total workload for each resource to flag overallocations
		type ResourceLoad struct {
			ResourceID      string                        `json:"resourceId"`
			Allocations     []*repository.ResourceAllocation `json:"allocations"`
			TotalLoad       int                           `json:"totalLoad"`
			IsOverAllocated bool                          `json:"isOverAllocated"`
		}

		loads := make(map[string]*ResourceLoad)
		for _, a := range allocations {
			if _, exists := loads[a.ResourceID]; !exists {
				// Query all allocations of this resource across all projects to get actual total load
				allAllocs, err := allocRepo.ListResourceAllocations(c.Request.Context(), a.ResourceID)
				totalLoad := 0
				if err == nil {
					for _, other := range allAllocs {
						totalLoad += other.AllocationPercent
					}
				}
				loads[a.ResourceID] = &ResourceLoad{
					ResourceID:      a.ResourceID,
					Allocations:     allAllocs,
					TotalLoad:       totalLoad,
					IsOverAllocated: totalLoad > 100,
				}
			}
		}

		c.JSON(http.StatusOK, gin.H{"data": gin.H{"allocations": allocations, "resourceLoads": loads}})
	})

	v1.POST("/projects/:projectId/resources", func(c *gin.Context) {
		var body struct {
			ResourceID        string `json:"resourceId" binding:"required"`
			AllocationPercent int    `json:"allocationPercent" binding:"required"`
			StartDate         string `json:"startDate" binding:"required"`
			EndDate           string `json:"endDate" binding:"required"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		start, err := time.Parse("2006-01-02", body.StartDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start date format, use YYYY-MM-DD"})
			return
		}
		end, err := time.Parse("2006-01-02", body.EndDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end date format, use YYYY-MM-DD"})
			return
		}

		alloc := &repository.ResourceAllocation{
			ID:                uuid.New().String(),
			ResourceID:        body.ResourceID,
			ProjectID:         c.Param("projectId"),
			AllocationPercent: body.AllocationPercent,
			StartDate:         start,
			EndDate:           end,
		}

		if err := allocRepo.CreateAllocation(c.Request.Context(), alloc); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"data": alloc})
	})

	// ─── Portfolio Rollup ──────────────────────────────────────
	v1.GET("/projects/:projectId/rollup", func(c *gin.Context) {
		projectID := c.Param("projectId")
		tasks, err := taskRepo.ListProjectTasks(c.Request.Context(), projectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		totalTime, err := timeRepo.GetProjectTime(c.Request.Context(), projectID)
		if err != nil {
			totalTime = 0
		}

		totalTasks := len(tasks)
		doneTasks := 0
		totalScheduledDays := 0

		for _, t := range tasks {
			if t.Status == "Done" || t.Status == "done" || t.Status == "APPROVED" {
				doneTasks++
			}
			totalScheduledDays += t.DurationDays
		}

		progressPercent := 0.0
		if totalTasks > 0 {
			progressPercent = (float64(doneTasks) / float64(totalTasks)) * 100
		}

		c.JSON(http.StatusOK, gin.H{
			"data": gin.H{
				"projectId":          projectID,
				"totalTasks":         totalTasks,
				"completedTasks":     doneTasks,
				"progressPercent":    progressPercent,
				"totalScheduledDays": totalScheduledDays,
				"actualLoggedHours":  float64(totalTime) / 3600.0,
			},
		})
	})

	return r
}
