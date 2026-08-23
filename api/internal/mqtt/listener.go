package mqtt

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"semantic-layer-explore/api/internal/config"
	"semantic-layer-explore/api/internal/kafka"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

func Listen(ctx context.Context, cfg config.Config, producer *kafka.Producer, logger *slog.Logger) {
	if cfg.MQTTURL == "" || cfg.MQTTTopic == "" {
		logger.Info("mqtt listener disabled", "url", cfg.MQTTURL, "topic", cfg.MQTTTopic)
		<-ctx.Done()
		return
	}

	opts := mqtt.NewClientOptions().
		AddBroker(cfg.MQTTURL).
		SetClientID("physicalai-go-gateway").
		SetAutoReconnect(true).
		SetConnectRetry(true).
		SetConnectRetryInterval(2 * time.Second).
		SetOrderMatters(false)

	opts.OnConnect = func(client mqtt.Client) {
		token := client.Subscribe(cfg.MQTTTopic, 1, func(_ mqtt.Client, message mqtt.Message) {
			handleMessage(ctx, producer, logger, message)
		})
		if !token.WaitTimeout(10 * time.Second) {
			logger.Error("mqtt subscribe timed out", "topic", cfg.MQTTTopic)
			return
		}
		if token.Error() != nil {
			logger.Error("mqtt subscribe failed", "topic", cfg.MQTTTopic, "error", token.Error())
			return
		}
		logger.Info("mqtt subscribed", "topic", cfg.MQTTTopic)
	}
	opts.OnConnectionLost = func(_ mqtt.Client, err error) {
		logger.Warn("mqtt connection lost", "error", err)
	}

	client := mqtt.NewClient(opts)
	token := client.Connect()
	if !token.WaitTimeout(15 * time.Second) {
		logger.Error("mqtt connect timed out", "url", cfg.MQTTURL)
	} else if token.Error() != nil {
		logger.Error("mqtt connect failed", "url", cfg.MQTTURL, "error", token.Error())
	} else {
		logger.Info("mqtt listener connected", "url", cfg.MQTTURL, "topic", cfg.MQTTTopic)
	}

	<-ctx.Done()
	client.Disconnect(250)
	logger.Info("mqtt listener stopped")
}

func handleMessage(ctx context.Context, producer *kafka.Producer, logger *slog.Logger, message mqtt.Message) {
	var event kafka.TelemetryEvent
	if err := json.Unmarshal(message.Payload(), &event); err != nil {
		logger.Warn("mqtt telemetry decode failed", "topic", message.Topic(), "error", err)
		return
	}
	if err := event.Validate(); err != nil {
		logger.Warn("mqtt telemetry validation failed", "topic", message.Topic(), "eventId", event.EventID, "error", err)
		return
	}
	if event.Source == "" {
		event.Source = "mqtt"
	}
	if err := producer.PublishTelemetry(ctx, event); err != nil {
		logger.Error("mqtt telemetry publish failed", "topic", message.Topic(), "eventId", event.EventID, "error", err)
		return
	}
	logger.Info("mqtt telemetry queued", "topic", message.Topic(), "eventId", event.EventID, "deviceId", event.DeviceID)
}
