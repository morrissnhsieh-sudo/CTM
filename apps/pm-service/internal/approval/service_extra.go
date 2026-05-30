package approval

import (
	"context"

	"github.com/ctm/pm-service/internal/repository"
)

// GetRowApproval retrieves the current approval for a row.
func (s *Service) GetRowApproval(ctx context.Context, rowID string) (*repository.Approval, error) {
	return s.repo.GetRowApproval(ctx, rowID)
}
