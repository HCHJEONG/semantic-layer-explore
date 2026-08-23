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
	producer eventPublisher
	store    *persistence.Store
	logger   *slog.Logger
	mu       sync.RWMutex
	client   mqtt.Client
}

func NewAdapter(cfg config.Config, producer *kafka.Producer, store *persistence.Store, logger *slog.Logger) *Adapter {
	return &Adapter{cfg: cfg, producer: producer, store: store, logger: logger}
}

func (a *Adapter) Run(ctx context.Context) {
	clientID, instanceID, err := resolveClientID(a.cfg)
	if err != nil {
		a.logger.Error("mqtt identity configuration failed", "error", err)
		return
	}
	telemetrySubscription, err := sharedSubscription(a.cfg.MQTTTelemetrySharedGroup, a.cfg.MQTTTopic)
	if err != nil {
		a.logger.Error("mqtt telemetry subscription configuration failed", "error", err)
		return
	}
	resultSubscription, err := sharedSubscription(a.cfg.MQTTResultSharedGroup, a.cfg.MQTTResultTopic)
	if err != nil {
		a.logger.Error("mqtt command result subscription configuration failed", "error", err)
		return
	}

	opts := mqtt.NewClientOptions().AddBroker(a.cfg.MQTTURL).SetClientID(clientID).SetAutoReconnect(true).SetConnectRetry(true).SetConnectRetryInterval(2 * time.Second).SetOrderMatters(false).SetAutoAckDisabled(true)
	opts.OnConnect = func(client mqtt.Client) {
		subscriptions := map[string]byte{telemetrySubscription: 1, resultSubscription: 1}
		token := client.SubscribeMultiple(subscriptions, func(_ mqtt.Client, message mqtt.Message) {
			a.handleDelivery(ctx, message)
		})
		if !token.WaitTimeout(10*time.Second) || token.Error() != nil {
			a.logger.Error("mqtt subscribe failed", "error", token.Error())
			return
		}
		a.logger.Info("mqtt adapter subscribed", "instanceId", instanceID, "clientId", clientID, "telemetryTopic", telemetrySubscription, "resultTopic", resultSubscription)
	}
	client := mqtt.NewClient(opts)
	a.mu.Lock()
	a.client = client
	a.mu.Unlock()
	if token := client.Connect(); !token.WaitTimeout(15*time.Second) || token.Error() != nil {
		a.logger.Error("mqtt connect failed", "url", a.cfg.MQTTURL, "instanceId", instanceID, "clientId", clientID, "error", token.Error())
	}
	go a.dispatchLoop(ctx, clientID)
	<-ctx.Done()
	client.Disconnect(250)
}

func (a *Adapter) handleDelivery(ctx context.Context, message mqtt.Message) {
	ack := false
	if strings.HasSuffix(message.Topic(), "/command-results") {
		ack = a.handleCommandResult(ctx, message)
	} else {
		ack = handleMessage(ctx, a.producer, a.logger, message)
	}
	if ack {
		message.Ack()
	}
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

func (a *Adapter) dispatchLoop(ctx context.Context, owner string) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.publishTimeouts(ctx, owner)
			a.publishExhaustedFailures(ctx, owner)
			commands, err := a.store.ClaimDispatchableCommands(ctx, owner, a.cfg.CommandLease, 20)
			if err != nil {
				a.logger.Warn("command dispatch query failed", "error", err)
				continue
			}
			for _, command := range commands {
				if err := a.PublishCommand(ctx, command.CommandID, command.DeviceID, command.Payload); err != nil {
					if command.PublishAttempts >= a.cfg.CommandMaxPublishAttempts {
						if markErr := a.store.MarkCommandPublishExhausted(ctx, command.CommandID, owner, err); markErr != nil {
							a.logger.Warn("command publish exhaustion update failed", "commandId", command.CommandID, "error", markErr)
						}
					} else {
						delay := a.cfg.CommandRetryInitial << (command.PublishAttempts - 1)
						if delay > a.cfg.CommandRetryMax {
							delay = a.cfg.CommandRetryMax
						}
						if retryErr := a.store.ScheduleCommandRetry(ctx, command, owner, err, time.Now().Add(delay), a.cfg.CommandMaxPublishAttempts); retryErr != nil {
							a.logger.Warn("command retry scheduling failed", "commandId", command.CommandID, "error", retryErr)
						}
					}
					continue
				}
				if err := a.store.MarkCommandPublished(ctx, command.CommandID, owner); err != nil {
					a.logger.Warn("command publish status failed", "commandId", command.CommandID, "error", err)
				}
			}
		}
	}
}

func (a *Adapter) publishExhaustedFailures(ctx context.Context, owner string) {
	commands, err := a.store.ClaimCommandsAwaitingFailureResult(ctx, owner, a.cfg.CommandLease, 20)
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
		if err := a.store.DelayCommandFailureResult(ctx, command.CommandID, owner); err != nil {
			a.logger.Warn("exhausted command result claim release skipped", "commandId", command.CommandID, "error", err)
		}
	}
}

func (a *Adapter) publishTimeouts(ctx context.Context, owner string) {
	commands, err := a.store.ClaimTimedOutCommands(ctx, owner, a.cfg.CommandAckTimeout, a.cfg.CommandLease, 20)
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
		if err := a.store.MarkCommandTimeoutNotified(ctx, command.CommandID, owner); err != nil {
			a.logger.Warn("command timeout claim release skipped", "commandId", command.CommandID, "error", err)
		}
	}
}

func (a *Adapter) handleCommandResult(ctx context.Context, message mqtt.Message) bool {
	var envelope struct {
		SchemaVersion string `json:"schemaVersion"`
		CommandID     string `json:"commandId"`
		DeviceID      string `json:"deviceId"`
		Success       *bool  `json:"success"`
		OccurredAt    string `json:"occurredAt"`
	}
	if err := json.Unmarshal(message.Payload(), &envelope); err != nil || envelope.SchemaVersion != "command-result.v1" || envelope.CommandID == "" || envelope.DeviceID == "" || envelope.Success == nil {
		a.logger.Warn("mqtt command result rejected", "topic", message.Topic(), "error", err)
		return true
	}
	if _, err := time.Parse(time.RFC3339, envelope.OccurredAt); err != nil {
		a.logger.Warn("mqtt command result timestamp rejected", "commandId", envelope.CommandID)
		return true
	}
	if err := a.producer.PublishCommandResult(ctx, envelope.DeviceID, message.Payload()); err != nil {
		a.logger.Error("command result kafka publish failed", "commandId", envelope.CommandID, "error", err)
		return false
	}
	return true
}
