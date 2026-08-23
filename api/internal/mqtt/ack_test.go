package mqtt

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"

	"semantic-layer-explore/api/internal/config"
	"semantic-layer-explore/api/internal/kafka"
)

type fakePublisher struct {
	telemetryErr     error
	commandResultErr error
}

func (publisher *fakePublisher) PublishTelemetry(context.Context, kafka.TelemetryEvent) error {
	return publisher.telemetryErr
}

func (publisher *fakePublisher) PublishCommandResult(context.Context, string, []byte) error {
	return publisher.commandResultErr
}

type fakeMessage struct {
	topic   string
	payload []byte
	acked   bool
}

func (*fakeMessage) Duplicate() bool         { return false }
func (*fakeMessage) Qos() byte               { return 1 }
func (*fakeMessage) Retained() bool          { return false }
func (message *fakeMessage) Topic() string   { return message.topic }
func (*fakeMessage) MessageID() uint16       { return 1 }
func (message *fakeMessage) Payload() []byte { return message.payload }
func (message *fakeMessage) Ack()            { message.acked = true }

func TestTelemetryAcknowledgementFollowsKafkaPublish(t *testing.T) {
	payload := []byte(`{"schemaVersion":"telemetry.v1","eventId":"event-1","deviceId":"device-1","sensorId":"sensor-1","sequence":1,"measuredAt":"2026-08-24T00:00:00Z","payload":{"kind":"temperature","value":25,"unit":"C"}}`)
	message := &fakeMessage{topic: "devices/device-1/telemetry", payload: payload}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	failing := &Adapter{cfg: config.Config{}, producer: &fakePublisher{telemetryErr: errors.New("kafka unavailable")}, logger: logger}
	failing.handleDelivery(context.Background(), message)
	if message.acked {
		t.Fatal("Kafka failure acknowledged the MQTT telemetry message")
	}
	succeeding := &Adapter{cfg: config.Config{}, producer: &fakePublisher{}, logger: logger}
	succeeding.handleDelivery(context.Background(), message)
	if !message.acked {
		t.Fatal("Kafka success did not acknowledge the MQTT telemetry message")
	}
}

func TestCommandResultAcknowledgementFollowsKafkaPublish(t *testing.T) {
	payload := []byte(`{"schemaVersion":"command-result.v1","commandId":"command-1","deviceId":"device-1","success":true,"occurredAt":"2026-08-24T00:00:00Z"}`)
	message := &fakeMessage{topic: "devices/device-1/command-results", payload: payload}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	failing := &Adapter{cfg: config.Config{}, producer: &fakePublisher{commandResultErr: errors.New("kafka unavailable")}, logger: logger}
	failing.handleDelivery(context.Background(), message)
	if message.acked {
		t.Fatal("Kafka failure acknowledged the MQTT command result")
	}
	succeeding := &Adapter{cfg: config.Config{}, producer: &fakePublisher{}, logger: logger}
	succeeding.handleDelivery(context.Background(), message)
	if !message.acked {
		t.Fatal("Kafka success did not acknowledge the MQTT command result")
	}
}
