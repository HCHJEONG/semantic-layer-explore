package mqtt

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"semantic-layer-explore/api/internal/config"
	"semantic-layer-explore/api/internal/kafka"
	"semantic-layer-explore/api/internal/persistence"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

type Adapter struct {
	cfg      config.Config
	producer *kafka.Producer
	store    *persistence.Store
	logger   *slog.Logger
	mu       sync.RWMutex
	client   mqtt.Client
}

func NewAdapter(cfg config.Config, producer *kafka.Producer, store *persistence.Store, logger *slog.Logger) *Adapter {
	return &Adapter{cfg: cfg, producer: producer, store: store, logger: logger}
}

func (a *Adapter) Run(ctx context.Context) {
	opts := mqtt.NewClientOptions().AddBroker(a.cfg.MQTTURL).SetClientID("physicalai-go-gateway").SetAutoReconnect(true).SetConnectRetry(true).SetConnectRetryInterval(2 * time.Second).SetOrderMatters(false)
	opts.OnConnect = func(client mqtt.Client) {
		subscriptions := map[string]byte{a.cfg.MQTTTopic: 1, a.cfg.MQTTResultTopic: 1}
		token := client.SubscribeMultiple(subscriptions, func(_ mqtt.Client, message mqtt.Message) {
			if strings.HasSuffix(message.Topic(), "/command-results") {
				a.handleCommandResult(ctx, message)
				return
			}
			handleMessage(ctx, a.producer, a.logger, message)
		})
		if !token.WaitTimeout(10*time.Second) || token.Error() != nil {
			a.logger.Error("mqtt subscribe failed", "error", token.Error())
			return
		}
		a.logger.Info("mqtt adapter subscribed", "telemetryTopic", a.cfg.MQTTTopic, "resultTopic", a.cfg.MQTTResultTopic)
	}
	client := mqtt.NewClient(opts)
	a.mu.Lock()
	a.client = client
	a.mu.Unlock()
	if token := client.Connect(); !token.WaitTimeout(15*time.Second) || token.Error() != nil {
		a.logger.Error("mqtt connect failed", "url", a.cfg.MQTTURL, "error", token.Error())
	}
	go a.dispatchLoop(ctx)
	<-ctx.Done()
	client.Disconnect(250)
}

func (a *Adapter) PublishCommand(ctx context.Context, commandID, deviceID string, payload []byte) error {
	a.mu.RLock()
	client := a.client
	a.mu.RUnlock()
	if client == nil || !client.IsConnectionOpen() {
		return fmt.Errorf("mqtt adapter is not connected")
	}
	topic := fmt.Sprintf(a.cfg.MQTTCommandTopic, deviceID)
	token := client.Publish(topic, 1, false, payload)
	if !token.WaitTimeout(5 * time.Second) {
		return fmt.Errorf("mqtt command publish timed out")
	}
	if token.Error() != nil {
		return token.Error()
	}
	a.logger.Info("mqtt command published", "commandId", commandID, "deviceId", deviceID, "topic", topic)
	return nil
}

func (a *Adapter) dispatchLoop(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.publishTimeouts(ctx)
			a.publishExhaustedFailures(ctx)
			commands, err := a.store.ClaimDispatchableCommands(ctx, 20)
			if err != nil {
				a.logger.Warn("command dispatch query failed", "error", err)
				continue
			}
			for _, command := range commands {
				if err := a.PublishCommand(ctx, command.CommandID, command.DeviceID, command.Payload); err != nil {
					if command.PublishAttempts >= a.cfg.CommandMaxPublishAttempts {
						if markErr := a.store.MarkCommandPublishExhausted(ctx, command.CommandID, err); markErr != nil {
							a.logger.Warn("command publish exhaustion update failed", "commandId", command.CommandID, "error", markErr)
						}
					} else {
						delay := a.cfg.CommandRetryInitial << (command.PublishAttempts - 1)
						if delay > a.cfg.CommandRetryMax {
							delay = a.cfg.CommandRetryMax
						}
						if retryErr := a.store.ScheduleCommandRetry(ctx, command, err, time.Now().Add(delay), a.cfg.CommandMaxPublishAttempts); retryErr != nil {
							a.logger.Warn("command retry scheduling failed", "commandId", command.CommandID, "error", retryErr)
						}
					}
					continue
				}
				if err := a.store.MarkCommandPublished(ctx, command.CommandID); err != nil {
					a.logger.Warn("command publish status failed", "commandId", command.CommandID, "error", err)
				}
			}
		}
	}
}

func (a *Adapter) publishExhaustedFailures(ctx context.Context) {
	commands, err := a.store.CommandsAwaitingFailureResult(ctx, 20)
	if err != nil {
		a.logger.Warn("exhausted command query failed", "error", err)
		return
	}
	for _, command := range commands {
		result := map[string]any{"schemaVersion": "command-result.v1", "commandId": command.CommandID, "deviceId": command.DeviceID, "success": false, "error": command.LastError, "failureCode": "mqtt.publish.exhausted", "publishAttempts": command.PublishAttempts, "occurredAt": time.Now().UTC().Format(time.RFC3339Nano)}
		body, _ := json.Marshal(result)
		if err := a.producer.PublishCommandResult(ctx, command.DeviceID, body); err != nil {
			a.logger.Warn("exhausted command result publish failed", "commandId", command.CommandID, "error", err)
			continue
		}
		_ = a.store.DelayCommandFailureResult(ctx, command.CommandID)
	}
}

func (a *Adapter) publishTimeouts(ctx context.Context) {
	commands, err := a.store.TimedOutCommands(ctx, a.cfg.CommandAckTimeout, 20)
	if err != nil {
		a.logger.Warn("command timeout query failed", "error", err)
		return
	}
	for _, command := range commands {
		result := map[string]any{"schemaVersion": "command-result.v1", "commandId": command.CommandID, "deviceId": command.DeviceID, "success": false, "error": "device acknowledgement timeout", "failureCode": "device.ack.timeout", "publishAttempts": command.PublishAttempts, "occurredAt": time.Now().UTC().Format(time.RFC3339Nano)}
		body, _ := json.Marshal(result)
		if err := a.producer.PublishCommandResult(ctx, command.DeviceID, body); err != nil {
			a.logger.Warn("command timeout publish failed", "commandId", command.CommandID, "error", err)
			continue
		}
		_ = a.store.MarkCommandTimeoutNotified(ctx, command.CommandID)
	}
}

func (a *Adapter) handleCommandResult(ctx context.Context, message mqtt.Message) {
	var envelope struct {
		SchemaVersion string `json:"schemaVersion"`
		CommandID     string `json:"commandId"`
		DeviceID      string `json:"deviceId"`
		Success       *bool  `json:"success"`
		OccurredAt    string `json:"occurredAt"`
	}
	if err := json.Unmarshal(message.Payload(), &envelope); err != nil || envelope.SchemaVersion != "command-result.v1" || envelope.CommandID == "" || envelope.DeviceID == "" || envelope.Success == nil {
		a.logger.Warn("mqtt command result rejected", "topic", message.Topic(), "error", err)
		return
	}
	if _, err := time.Parse(time.RFC3339, envelope.OccurredAt); err != nil {
		a.logger.Warn("mqtt command result timestamp rejected", "commandId", envelope.CommandID)
		return
	}
	if err := a.producer.PublishCommandResult(ctx, envelope.DeviceID, message.Payload()); err != nil {
		a.logger.Error("command result kafka publish failed", "commandId", envelope.CommandID, "error", err)
	}
}
