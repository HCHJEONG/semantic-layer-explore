package ssh

import (
	"context"
	"log/slog"

	"semantic-layer-explore/api/internal/config"
)

func Listen(ctx context.Context, cfg config.Config, logger *slog.Logger) {
	logger.Info("ssh listener skeleton configured", "addr", cfg.SSHAddr)
	<-ctx.Done()
	logger.Info("ssh listener stopped")
}
