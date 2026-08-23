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
	TelemetryCount       int64           `json:"telemetryCount"`
	DeadLetterCount      int64           `json:"deadLetterCount"`
	MastraDecisionCount  int64           `json:"mastraDecisionCount"`
	LatestTelemetry      *Telemetry      `json:"latestTelemetry,omitempty"`
	LatestDeadLetter     *DeadLetter     `json:"latestDeadLetter,omitempty"`
	LatestMastraDecision *MastraDecision `json:"latestMastraDecision,omitempty"`
	CheckedAt            string          `json:"checkedAt"`
}

type AgentResult struct {
	AuditID       string `json:"auditId"`
	ResultID      string `json:"resultId,omitempty"`
	Type          string `json:"type"`
	Kind          string `json:"kind,omitempty"`
	Status        string `json:"status,omitempty"`
	Mode          string `json:"mode,omitempty"`
	Trigger       string `json:"trigger,omitempty"`
	Summary       string `json:"summary,omitempty"`
	EventID       string `json:"eventId,omitempty"`
	DeviceID      string `json:"deviceId,omitempty"`
	SensorID      string `json:"sensorId,omitempty"`
	SensorKind    string `json:"sensorKind,omitempty"`
	Value         string `json:"value,omitempty"`
	Unit          string `json:"unit,omitempty"`
	CorrelationID string `json:"correlationId,omitempty"`
	OccurredAt    string `json:"occurredAt"`
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

type MastraDecision struct {
	AuditID    string `json:"auditId"`
	Type       string `json:"type"`
	Status     string `json:"status,omitempty"`
	Mode       string `json:"mode,omitempty"`
	Trigger    string `json:"trigger,omitempty"`
	Summary    string `json:"summary,omitempty"`
	OccurredAt string `json:"occurredAt"`
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
	if err := store.pool.QueryRow(ctx, "select count(*) from audit_event where type in ('mastra.telemetry.decision', 'mastra.telemetry.failed')").Scan(&summary.MastraDecisionCount); err != nil {
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

	var mastraDecision MastraDecision
	var occurredAt time.Time
	if err := store.pool.QueryRow(ctx, `
		select
			audit_id,
			type,
			coalesce(payload->>'status', ''),
			coalesce(payload->'payload'->>'mode', ''),
			coalesce(payload->'payload'->>'trigger', ''),
			coalesce(payload->>'summary', payload->>'error', ''),
			occurred_at
		from audit_event
		where type in ('mastra.telemetry.decision', 'mastra.telemetry.failed')
		order by occurred_at desc
		limit 1
	`).Scan(
		&mastraDecision.AuditID,
		&mastraDecision.Type,
		&mastraDecision.Status,
		&mastraDecision.Mode,
		&mastraDecision.Trigger,
		&mastraDecision.Summary,
		&occurredAt,
	); err == nil {
		mastraDecision.OccurredAt = occurredAt.UTC().Format(time.RFC3339)
		summary.LatestMastraDecision = &mastraDecision
	}

	summary.CheckedAt = time.Now().UTC().Format(time.RFC3339)
	return summary, nil
}

func (store *Store) ListAgentResults(ctx context.Context, limit int) ([]AgentResult, error) {
	if limit < 1 || limit > 50 {
		limit = 10
	}
	rows, err := store.pool.Query(ctx, `
		select
			audit_id,
			coalesce(payload->>'resultId', ''),
			type,
			coalesce(payload->>'kind', ''),
			coalesce(payload->>'status', ''),
			coalesce(payload->'payload'->>'mode', ''),
			coalesce(payload->'payload'->>'trigger', ''),
			coalesce(payload->>'summary', payload->>'error', ''),
			coalesce(payload->'payload'->'event'->>'eventId', payload->>'eventId', ''),
			coalesce(payload->'payload'->'event'->>'deviceId', payload->>'deviceId', ''),
			coalesce(payload->'payload'->'event'->>'sensorId', payload->>'sensorId', ''),
			coalesce(payload->'payload'->'event'->>'kind', ''),
			coalesce(payload->'payload'->'event'->>'value', ''),
			coalesce(payload->'payload'->'event'->>'unit', ''),
			coalesce(correlation_id, ''),
			occurred_at
		from audit_event
		where type in ('mastra.telemetry.decision', 'mastra.telemetry.failed')
		order by occurred_at desc
		limit $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]AgentResult, 0, limit)
	for rows.Next() {
		var result AgentResult
		var occurredAt time.Time
		if err := rows.Scan(
			&result.AuditID,
			&result.ResultID,
			&result.Type,
			&result.Kind,
			&result.Status,
			&result.Mode,
			&result.Trigger,
			&result.Summary,
			&result.EventID,
			&result.DeviceID,
			&result.SensorID,
			&result.SensorKind,
			&result.Value,
			&result.Unit,
			&result.CorrelationID,
			&occurredAt,
		); err != nil {
			return nil, err
		}
		result.OccurredAt = occurredAt.UTC().Format(time.RFC3339)
		results = append(results, result)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return results, nil
}

func (store *Store) Close() {
	store.pool.Close()
}
