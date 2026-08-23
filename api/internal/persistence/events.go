package persistence

import (
	"context"
	"encoding/json"
	"time"
)

type WorkspaceEvent struct {
	ID         int64          `json:"id"`
	EventID    string         `json:"eventId"`
	Type       string         `json:"type"`
	SourceType string         `json:"sourceType"`
	SourceID   string         `json:"sourceId"`
	Payload    map[string]any `json:"payload"`
	OccurredAt string         `json:"occurredAt"`
}

func scanWorkspaceEvent(row interface{ Scan(...any) error }) (WorkspaceEvent, error) {
	var item WorkspaceEvent
	var payload []byte
	var occurred time.Time
	err := row.Scan(&item.ID, &item.EventID, &item.Type, &item.SourceType, &item.SourceID, &payload, &occurred)
	if err != nil {
		return item, err
	}
	err = json.Unmarshal(payload, &item.Payload)
	item.OccurredAt = occurred.UTC().Format(time.RFC3339Nano)
	return item, err
}

const eventColumns = `id,event_id,type,source_type,source_id,payload,occurred_at`

func eventLimit(limit int) int {
	if limit < 1 {
		return 1
	}
	if limit > 200 {
		return 200
	}
	return limit
}
func (store *Store) ListWorkspaceEvents(ctx context.Context, limit int) ([]WorkspaceEvent, error) {
	rows, err := store.pool.Query(ctx, `select `+eventColumns+` from workspace_event order by occurred_at desc,id desc limit $1`, eventLimit(limit))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanWorkspaceEvents(rows)
}
func (store *Store) ListWorkspaceEventsAfter(ctx context.Context, id int64, limit int) ([]WorkspaceEvent, error) {
	rows, err := store.pool.Query(ctx, `select `+eventColumns+` from workspace_event where id>$1 order by id limit $2`, id, eventLimit(limit))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanWorkspaceEvents(rows)
}
func scanWorkspaceEvents(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
}) ([]WorkspaceEvent, error) {
	items := make([]WorkspaceEvent, 0)
	for rows.Next() {
		item, err := scanWorkspaceEvent(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (store *Store) GetWorkspaceEvent(ctx context.Context, eventID string) (WorkspaceEvent, error) {
	return scanWorkspaceEvent(store.pool.QueryRow(ctx, `select `+eventColumns+` from workspace_event where event_id=$1`, eventID))
}
