package kafka

import (
	"errors"
	"time"
)

type TelemetryPayload struct {
	Kind  string      `json:"kind"`
	Value any         `json:"value"`
	Unit  string      `json:"unit"`
}

type TelemetryEvent struct {
	SchemaVersion string           `json:"schemaVersion"`
	EventID       string           `json:"eventId"`
	DeviceID      string           `json:"deviceId"`
	SensorID      string           `json:"sensorId"`
	Sequence      int64            `json:"sequence"`
	MeasuredAt    string           `json:"measuredAt"`
	Source        string           `json:"source,omitempty"`
	Payload       TelemetryPayload `json:"payload"`
	CorrelationID string           `json:"correlationId,omitempty"`
	SessionID     string           `json:"sessionId,omitempty"`
}

func (event TelemetryEvent) Validate() error {
	if event.SchemaVersion != "telemetry.v1" {
		return errors.New("schemaVersion must be telemetry.v1")
	}
	if event.EventID == "" || event.DeviceID == "" || event.SensorID == "" {
		return errors.New("eventId, deviceId, and sensorId are required")
	}
	if event.Sequence < 0 {
		return errors.New("sequence must be non-negative")
	}
	if _, err := time.Parse(time.RFC3339, event.MeasuredAt); err != nil {
		return errors.New("measuredAt must be an RFC3339 timestamp")
	}
	if event.Payload.Kind == "" || event.Payload.Unit == "" {
		return errors.New("payload.kind and payload.unit are required")
	}
	return nil
}
