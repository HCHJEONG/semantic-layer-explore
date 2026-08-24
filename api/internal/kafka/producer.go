package kafka

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/segmentio/kafka-go"
)

type Producer struct {
	brokers             []string
	writer              *kafka.Writer
	rebuildWriter       *kafka.Writer
	commandResultWriter *kafka.Writer
	logger              *slog.Logger
}

func NewProducer(brokers []string, topic string, rebuildTopic string, commandResultTopic string, logger *slog.Logger) *Producer {
	return &Producer{
		brokers: brokers,
		writer: &kafka.Writer{
			Addr:         kafka.TCP(brokers...),
			Topic:        topic,
			Balancer:     &kafka.Hash{},
			RequiredAcks: kafka.RequireAll,
			Async:        false,
		},
		rebuildWriter:       &kafka.Writer{Addr: kafka.TCP(brokers...), Topic: rebuildTopic, RequiredAcks: kafka.RequireAll, Async: false},
		commandResultWriter: &kafka.Writer{Addr: kafka.TCP(brokers...), Topic: commandResultTopic, Balancer: &kafka.Hash{}, RequiredAcks: kafka.RequireAll, Async: false},
		logger:              logger,
	}
}

func (p *Producer) Ping(ctx context.Context) error {
	connection, err := kafka.DialContext(ctx, "tcp", p.brokers[0])
	if err != nil {
		return err
	}
	defer connection.Close()
	if deadline, ok := ctx.Deadline(); ok {
		_ = connection.SetDeadline(deadline)
	}
	_, err = connection.ReadPartitions()
	return err
}

func (p *Producer) PublishCommandResult(ctx context.Context, deviceID string, value []byte) error {
	publishCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return p.commandResultWriter.WriteMessages(publishCtx, kafka.Message{Key: []byte(deviceID), Value: value})
}

type GraphRebuild struct {
	SchemaVersion string `json:"schemaVersion"`
	RebuildID     string `json:"rebuildId"`
	RequestedAt   string `json:"requestedAt"`
	Scope         string `json:"scope"`
}

func (p *Producer) PublishGraphRebuild(ctx context.Context, event GraphRebuild) error {
	value, err := json.Marshal(event)
	if err != nil {
		return err
	}
	publishCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return p.rebuildWriter.WriteMessages(publishCtx, kafka.Message{Key: []byte(event.RebuildID), Value: value})
}

func (p *Producer) PublishTelemetry(ctx context.Context, event TelemetryEvent) error {
	value, err := json.Marshal(event)
	if err != nil {
		return err
	}
	publishCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return p.writer.WriteMessages(publishCtx, kafka.Message{
		Key:   []byte(event.DeviceID),
		Value: value,
		Headers: []kafka.Header{
			{Key: "schemaVersion", Value: []byte(event.SchemaVersion)},
			{Key: "eventId", Value: []byte(event.EventID)},
		},
	})
}

func (p *Producer) Close() {
	if err := p.writer.Close(); err != nil {
		p.logger.Warn("kafka writer close failed", "error", err)
	}
	if err := p.rebuildWriter.Close(); err != nil {
		p.logger.Warn("Kafka rebuild writer close failed", "error", err)
	}
	if err := p.commandResultWriter.Close(); err != nil {
		p.logger.Warn("Kafka command result writer close failed", "error", err)
	}
}
