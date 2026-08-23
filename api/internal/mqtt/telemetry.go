package mqtt

import (
	"context"
	"encoding/json"
	"log/slog"

	"semantic-layer-explore/api/internal/kafka"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

type eventPublisher interface {
	PublishTelemetry(context.Context, kafka.TelemetryEvent) error
	PublishCommandResult(context.Context, string, []byte) error
}

func handleMessage(ctx context.Context, producer eventPublisher, logger *slog.Logger, message mqtt.Message) bool {
	var event kafka.TelemetryEvent
	if err := json.Unmarshal(message.Payload(), &event); err != nil {
		logger.Warn("mqtt telemetry decode failed", "topic", message.Topic(), "error", err)
		return true
	}
	if err := event.Validate(); err != nil {
		logger.Warn("mqtt telemetry validation failed", "topic", message.Topic(), "eventId", event.EventID, "error", err)
		return true
	}
	if event.Source == "" {
		event.Source = "mqtt"
	}
	if err := producer.PublishTelemetry(ctx, event); err != nil {
		logger.Error("mqtt telemetry publish failed", "topic", message.Topic(), "eventId", event.EventID, "error", err)
		return false
	}
	logger.Info("mqtt telemetry queued", "topic", message.Topic(), "eventId", event.EventID, "deviceId", event.DeviceID)
	return true
}
