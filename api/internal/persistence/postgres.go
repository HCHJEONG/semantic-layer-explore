package persistence

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

type OperationsSummary struct {
	TelemetryCount   int64       `json:"telemetryCount"`
	DeadLetterCount  int64       `json:"deadLetterCount"`
	LatestTelemetry  *Telemetry  `json:"latestTelemetry,omitempty"`
	LatestDeadLetter *DeadLetter `json:"latestDeadLetter,omitempty"`
	CheckedAt        string      `json:"checkedAt"`
}

type Telemetry struct {
	EventID     string `json:"eventId"`
	DeviceID    string `json:"deviceId"`
	SensorID    string `json:"sensorId"`
	ProcessedAt string `json:"processedAt"`
}

type DeadLetter struct {
	DeadLetterID string `json:"deadLetterId"`
	Reason       string `json:"reason"`
	ErrorMessage string `json:"errorMessage"`
	FailedAt     string `json:"failedAt"`
}

func NewStore(ctx context.Context, databaseURL string) (*Store, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	return &Store{pool: pool}, nil
}

func (store *Store) OperationsSummary(ctx context.Context) (OperationsSummary, error) {
	var summary OperationsSummary
	if err := store.pool.QueryRow(ctx, "select count(*) from telemetry_event").Scan(&summary.TelemetryCount); err != nil {
		return summary, err
	}
	if err := store.pool.QueryRow(ctx, "select count(*) from dead_letter_event").Scan(&summary.DeadLetterCount); err != nil {
		return summary, err
	}

	var telemetry Telemetry
	var processedAt time.Time
	if err := store.pool.QueryRow(ctx, `
		select event_id, device_id, sensor_id, processed_at
		from telemetry_event
		order by processed_at desc
		limit 1
	`).Scan(&telemetry.EventID, &telemetry.DeviceID, &telemetry.SensorID, &processedAt); err == nil {
		telemetry.ProcessedAt = processedAt.UTC().Format(time.RFC3339)
		summary.LatestTelemetry = &telemetry
	}

	var deadLetter DeadLetter
	var failedAt time.Time
	if err := store.pool.QueryRow(ctx, `
		select dead_letter_id, reason, error_message, failed_at
		from dead_letter_event
		order by failed_at desc
		limit 1
	`).Scan(&deadLetter.DeadLetterID, &deadLetter.Reason, &deadLetter.ErrorMessage, &failedAt); err == nil {
		deadLetter.FailedAt = failedAt.UTC().Format(time.RFC3339)
		summary.LatestDeadLetter = &deadLetter
	}

	summary.CheckedAt = time.Now().UTC().Format(time.RFC3339)
	return summary, nil
}

func (store *Store) Close() {
	store.pool.Close()
}
