package grpc

import (
	"context"

	"github.com/ctm/pm-service/internal/approval"
	"github.com/ctm/pm-service/internal/cpm"
	"github.com/ctm/pm-service/internal/repository"
	"github.com/ctm/pm-service/internal/trigger"
	"go.uber.org/zap"
	googlegrpc "google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// PMServer implements the gRPC PM service.
// This is a skeleton; protobuf-generated interfaces are added during code generation.
type PMServer struct {
	taskRepo    repository.TaskRepository
	projectRepo repository.ProjectRepository
	cpmSvc      *cpm.Service
	approvalSvc *approval.Service
	triggerSvc  *trigger.Service
	timeRepo    repository.TimeRepository
	log         *zap.Logger
}

func NewPMServer(
	taskRepo repository.TaskRepository,
	projectRepo repository.ProjectRepository,
	cpmSvc *cpm.Service,
	approvalSvc *approval.Service,
	triggerSvc *trigger.Service,
	timeRepo repository.TimeRepository,
	log *zap.Logger,
) *PMServer {
	return &PMServer{
		taskRepo:    taskRepo,
		projectRepo: projectRepo,
		cpmSvc:      cpmSvc,
		approvalSvc: approvalSvc,
		triggerSvc:  triggerSvc,
		timeRepo:    timeRepo,
		log:         log,
	}
}

// RegisterPMServiceServer is a placeholder until protobuf codegen runs.
// Real registration: pb.RegisterPMServiceServer(grpcServer, pmGrpc)
func RegisterPMServiceServer(s *googlegrpc.Server, srv *PMServer) {
	// placeholder — protobuf codegen generates the real RegisterXxx function
}

// ─── gRPC Interceptors ───────────────────────────────────────────────────────

// AuthInterceptor validates that internal service headers are present.
func AuthInterceptor(
	ctx context.Context,
	req interface{},
	info *googlegrpc.UnaryServerInfo,
	handler googlegrpc.UnaryHandler,
) (interface{}, error) {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing metadata")
	}

	cn := md.Get("x-client-cert-cn")
	if len(cn) == 0 {
		return nil, status.Error(codes.Unauthenticated, "missing service certificate")
	}

	return handler(ctx, req)
}

// LoggingInterceptor logs gRPC calls.
func LoggingInterceptor(log *zap.Logger) googlegrpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req interface{},
		info *googlegrpc.UnaryServerInfo,
		handler googlegrpc.UnaryHandler,
	) (interface{}, error) {
		log.Info("gRPC call", zap.String("method", info.FullMethod))
		resp, err := handler(ctx, req)
		if err != nil {
			log.Error("gRPC error", zap.String("method", info.FullMethod), zap.Error(err))
		}
		return resp, err
	}
}
