package main

import (
	"context"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ctm/pm-service/internal/approval"
	"github.com/ctm/pm-service/internal/cpm"
	"github.com/ctm/pm-service/internal/grpc"
	pmhttp "github.com/ctm/pm-service/internal/http"
	"github.com/ctm/pm-service/internal/kafka"
	"github.com/ctm/pm-service/internal/repository"
	"github.com/ctm/pm-service/internal/trigger"
	"go.uber.org/zap"

	"github.com/jackc/pgx/v5/pgxpool"
	googlegrpc "google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func main() {
	log, _ := zap.NewProduction()
	defer log.Sync()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// ─── Database ──────────────────────────────────────────────
	dbURL := mustEnv("DB_URL")
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatal("failed to connect to database", zap.Error(err))
	}
	defer pool.Close()

	// ─── Kafka ─────────────────────────────────────────────────
	kafkaBrokers := getEnv("KAFKA_BROKERS", "localhost:9092")
	publisher := kafka.NewPublisher(kafkaBrokers, log)
	defer publisher.Close()

	consumer := kafka.NewConsumer(kafkaBrokers, "pm-service", log)
	defer consumer.Close()

	// ─── Repositories ──────────────────────────────────────────
	taskRepo := repository.NewTaskRepository(pool)
	projectRepo := repository.NewProjectRepository(pool)
	approvalRepo := repository.NewApprovalRepository(pool)
	triggerRepo := repository.NewTriggerRepository(pool)
	timeRepo := repository.NewTimeRepository(pool)

	// ─── Domain services ───────────────────────────────────────
	cpmSvc := cpm.NewService(taskRepo, log)
	approvalSvc := approval.NewService(approvalRepo, publisher, log)
	triggerSvc := trigger.NewService(triggerRepo, publisher, log)

	// ─── gRPC Server ───────────────────────────────────────────
	grpcAddr := getEnv("GRPC_ADDR", ":50051")
	grpcServer := googlegrpc.NewServer(
		googlegrpc.ChainUnaryInterceptor(
			grpc.AuthInterceptor,
			grpc.LoggingInterceptor(log),
		),
	)
	reflection.Register(grpcServer)

	pmGrpc := grpc.NewPMServer(taskRepo, projectRepo, cpmSvc, approvalSvc, triggerSvc, timeRepo, log)
	grpc.RegisterPMServiceServer(grpcServer, pmGrpc)

	grpcLis, err := net.Listen("tcp", grpcAddr)
	if err != nil {
		log.Fatal("failed to listen gRPC", zap.Error(err))
	}

	// ─── HTTP / REST gateway (for M3 proxy) ────────────────────
	httpAddr := getEnv("HTTP_ADDR", ":8080")
	router := pmhttp.NewRouter(taskRepo, projectRepo, cpmSvc, approvalSvc, triggerSvc, timeRepo, log)
	httpServer := &http.Server{Addr: httpAddr, Handler: router}

	// ─── Kafka consumer ────────────────────────────────────────
	go consumer.ConsumeRows(ctx, triggerSvc, taskRepo, log)

	// ─── Start servers ─────────────────────────────────────────
	go func() {
		log.Info("gRPC server starting", zap.String("addr", grpcAddr))
		if err := grpcServer.Serve(grpcLis); err != nil {
			log.Error("gRPC server error", zap.Error(err))
		}
	}()

	go func() {
		log.Info("HTTP server starting", zap.String("addr", httpAddr))
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("HTTP server error", zap.Error(err))
		}
	}()

	<-ctx.Done()
	log.Info("Shutting down PM service...")

	grpcServer.GracefulStop()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	httpServer.Shutdown(shutdownCtx)

	log.Info("PM service stopped")
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic("required env var missing: " + key)
	}
	return v
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
