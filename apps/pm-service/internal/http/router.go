package http

import (
	"net/http"

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
		projects, err := projectRepo.ListWorkspaceProjects(c.Request.Context(), workspaceID)
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

		project := &repository.Project{
			ID:          uuid.New().String(),
			WorkspaceID: c.GetString("workspaceId"),
			Name:        body.Name,
			Status:      "active",
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

	// ─── CPM ─────────────────────────────────────────────────
	v1.GET("/projects/:projectId/critical-path", func(c *gin.Context) {
		cp, err := cpmSvc.Compute(c.Request.Context(), c.Param("projectId"))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": cp})
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
			RowID string `json:"rowId" binding:"required"`
			Note  string `json:"note"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		entry := &repository.TimeEntry{
			ID:     uuid.New().String(),
			RowID:  body.RowID,
			UserID: c.GetString("userId"),
			Note:   body.Note,
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

	return r
}
