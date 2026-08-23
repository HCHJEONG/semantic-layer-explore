package persistence

import (
	"context"
	"encoding/json"
)

type OutboxEvent struct {
	ID                  int64
	EventID, Topic, Key string
	Payload             json.RawMessage
}

func (store *Store) NextOutbox(ctx context.Context) (*OutboxEvent, error) {
	var event OutboxEvent
	err := store.pool.QueryRow(ctx, `select id,event_id,topic,key,payload from outbox_event where published_at is null order by id limit 1`).Scan(&event.ID, &event.EventID, &event.Topic, &event.Key, &event.Payload)
	if err != nil {
		return nil, err
	}
	return &event, nil
}

func (store *Store) MarkOutboxPublished(ctx context.Context, id int64) error {
	_, err := store.pool.Exec(ctx, `update outbox_event set published_at=now() where id=$1 and published_at is null`, id)
	return err
}
