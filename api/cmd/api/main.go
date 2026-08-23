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
	"semantic-layer-explore/api/internal/outbox"
	"semantic-layer-explore/api/internal/persistence"
	"semantic-layer-explore/api/internal/ssh"
)

func main() {
	cfg := config.FromEnv()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	producer := kafka.NewProducer(cfg.KafkaBrokers, cfg.TelemetryTopic, cfg.GraphRebuildTopic, cfg.CommandResultTopic, logger)
	defer producer.Close()

	store, err := persistence.NewStore(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("postgres connection failed", "error", err)
		os.Exit(1)
	}
	defer store.Close()

	mqttAdapter := mqtt.NewAdapter(cfg, producer, store, logger)
	server := &http.Server{
		Addr:         cfg.HTTPAddr,
		Handler:      httpapi.NewRouter(cfg, producer, store, mqttAdapter, logger),
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 0,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("http gateway listening", "addr", cfg.HTTPAddr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("http gateway failed", "error", err)
			stop()
		}
	}()

	go ssh.Listen(ctx, cfg, logger)
	go mqttAdapter.Run(ctx)
	go outbox.New(store, producer, cfg.GraphRebuildTopic, logger).Run(ctx)

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
}
