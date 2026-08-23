package mqtt

import (
	"context"
	"log/slog"

	"semantic-layer-explore/api/internal/config"
	"semantic-layer-explore/api/internal/kafka"
)

func Listen(ctx context.Context, cfg config.Config, producer *kafka.Producer, logger *slog.Logger) {
	<-ctx.Done()
	_ = cfg
	_ = producer
	logger.Info("mqtt listener stopped", "status", "skeleton")
}
