package outbox

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"semantic-layer-explore/api/internal/kafka"
	"semantic-layer-explore/api/internal/persistence"
)

type Relay struct {
	store    *persistence.Store
	producer *kafka.Producer
	topic    string
	logger   *slog.Logger
}

func New(store *persistence.Store, producer *kafka.Producer, topic string, logger *slog.Logger) *Relay {
	return &Relay{store: store, producer: producer, topic: topic, logger: logger}
}

func (relay *Relay) Run(ctx context.Context) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			relay.publishAvailable(ctx)
		}
	}
}

func (relay *Relay) publishAvailable(ctx context.Context) {
	for {
		event, err := relay.store.NextOutbox(ctx)
		if errors.Is(err, pgx.ErrNoRows) {
			return
		}
		if err != nil {
			relay.logger.Error("outbox read failed", "error", err)
			return
		}
		if event.Topic != relay.topic {
			relay.logger.Error("unsupported outbox topic", "topic", event.Topic, "eventId", event.EventID)
			return
		}
		var rebuild kafka.GraphRebuild
		if err := json.Unmarshal(event.Payload, &rebuild); err != nil {
			relay.logger.Error("outbox payload invalid", "eventId", event.EventID, "error", err)
			return
		}
		if err := relay.producer.PublishGraphRebuild(ctx, rebuild); err != nil {
			relay.logger.Error("outbox publish failed", "eventId", event.EventID, "error", err)
			return
		}
		if err := relay.store.MarkOutboxPublished(ctx, event.ID); err != nil {
			relay.logger.Error("outbox mark published failed", "eventId", event.EventID, "error", err)
			return
		}
	}
}
