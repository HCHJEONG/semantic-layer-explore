package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"semantic-layer-explore/api/internal/config"
	"semantic-layer-explore/api/internal/httpapi"
	"semantic-layer-explore/api/internal/kafka"
	"semantic-layer-explore/api/internal/mqtt"
	"semantic-layer-explore/api/internal/ssh"
)

func main() {
	cfg := config.FromEnv()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	producer := kafka.NewProducer(cfg.KafkaBrokers, cfg.TelemetryTopic, logger)
	defer producer.Close()

	server := &http.Server{
		Addr:         cfg.HTTPAddr,
		Handler:      httpapi.NewRouter(cfg, producer, logger),
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	go func() {
		logger.Info("http gateway listening", "addr", cfg.HTTPAddr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("http gateway failed", "error", err)
			stop()
		}
	}()

	go ssh.Listen(ctx, cfg, logger)
	go mqtt.Listen(ctx, cfg, producer, logger)

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
}
