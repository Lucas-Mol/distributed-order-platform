package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/aws/aws-sdk-go-v2/service/ssm"

	"github.com/Lucas-Mol/order-platform-microservice-project/pdf-service/internal/config"
	"github.com/Lucas-Mol/order-platform-microservice-project/pdf-service/internal/consumer"
	"github.com/Lucas-Mol/order-platform-microservice-project/pdf-service/internal/invoice"
	"github.com/Lucas-Mol/order-platform-microservice-project/pdf-service/internal/pdf"
	"github.com/Lucas-Mol/order-platform-microservice-project/pdf-service/internal/publisher"
	"github.com/Lucas-Mol/order-platform-microservice-project/pdf-service/internal/storage"
)

const shutdownTimeout = 5 * time.Second

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(log); err != nil {
		log.Error("worker stopped", "error", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return fmt.Errorf("load AWS config: %w", err)
	}
	cfg, err := config.Load(ctx, os.Getenv, ssm.NewFromConfig(awsCfg))
	if err != nil {
		return err
	}
	sqsClient := sqs.NewFromConfig(awsCfg)
	queue, err := consumer.NewSQSQueue(ctx, sqsClient, cfg.OrdersQueue, cfg.WorkerConcurrency)
	if err != nil {
		return err
	}
	invoiceReady, err := publisher.NewSQSPublisher(ctx, sqsClient, cfg.InvoiceReadyQueue)
	if err != nil {
		return err
	}
	usePathStyle := os.Getenv("AWS_ENDPOINT_URL") != ""
	store, err := storage.NewS3Store(ctx, s3.NewFromConfig(awsCfg, func(o *s3.Options) { o.UsePathStyle = usePathStyle }), cfg.Bucket)
	if err != nil {
		return err
	}
	handler := invoice.NewHandler(log, store, invoiceReady, pdf.RenderInvoice, cfg.InvoicePrefix)

	server := &http.Server{
		Addr:              net.JoinHostPort("", strconv.Itoa(cfg.Port)),
		Handler:           healthHandler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	serverErr := make(chan error, 1)
	go func() {
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
		close(serverErr)
	}()

	log.Info("worker started", "queue", cfg.OrdersQueue, "publishes_to", cfg.InvoiceReadyQueue,
		"bucket", cfg.Bucket, "workers", cfg.WorkerConcurrency, "port", cfg.Port)
	consumerCtx, cancelConsumer := context.WithCancel(ctx)
	consumerDone := make(chan struct{})
	go func() {
		consumer.New(queue, handler, cfg.WorkerConcurrency, log).Run(consumerCtx)
		close(consumerDone)
	}()

	var runErr error
	select {
	case <-ctx.Done():
		log.Info("shutting down; waiting for in-flight messages")
	case err := <-serverErr:
		runErr = fmt.Errorf("health server: %w", err)
	}
	cancelConsumer()
	<-consumerDone

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Error("health server shutdown failed", "error", err)
	}
	return runErr
}

func healthHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	return mux
}
