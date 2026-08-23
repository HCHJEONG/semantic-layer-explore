package persistence

import (
	"context"
	"encoding/json"
	"time"
)

type PendingCommand struct {
	CommandID string
	DeviceID  string
	Payload   []byte
}

func (store *Store) CreateDeviceCommand(ctx context.Context, commandID, deviceID string, payload map[string]any, requestedAt time.Time) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `insert into device_command(command_id,device_id,payload,status,requested_at) values($1,$2,$3::jsonb,'pending',$4) on conflict(command_id) do nothing`, commandID, deviceID, body, requestedAt); err != nil {
		return err
	}
	event := map[string]any{"command": payload, "status": "pending"}
	eventBody, _ := json.Marshal(event)
	if _, err = tx.Exec(ctx, `insert into workspace_event(event_id,type,source_type,source_id,payload,occurred_at) values($1,'device.command.pending','device',$2,$3::jsonb,$4) on conflict(event_id) do nothing`, commandID+":pending", deviceID, eventBody, requestedAt); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (store *Store) DispatchableCommands(ctx context.Context, limit int) ([]PendingCommand, error) {
	rows, err := store.pool.Query(ctx, `select command_id,device_id,payload from device_command where status='pending' order by requested_at limit $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]PendingCommand, 0)
	for rows.Next() {
		var item PendingCommand
		if err := rows.Scan(&item.CommandID, &item.DeviceID, &item.Payload); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (store *Store) MarkCommandPublished(ctx context.Context, commandID string) error {
	_, err := store.pool.Exec(ctx, `update device_command set status='published',published_at=now(),last_error=null where command_id=$1 and status in ('pending','published')`, commandID)
	return err
}

func (store *Store) MarkCommandPublishFailed(ctx context.Context, commandID string, publishError error) {
	_, _ = store.pool.Exec(ctx, `update device_command set status='pending',last_error=$2 where command_id=$1 and status in ('pending','published')`, commandID, publishError.Error())
}

func (store *Store) TimedOutCommands(ctx context.Context, timeout time.Duration, limit int) ([]PendingCommand, error) {
	rows, err := store.pool.Query(ctx, `select command_id,device_id,payload from device_command where status='published' and published_at < now()-$1::interval order by published_at limit $2`, timeout.String(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]PendingCommand, 0)
	for rows.Next() {
		var item PendingCommand
		if err := rows.Scan(&item.CommandID, &item.DeviceID, &item.Payload); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (store *Store) MarkCommandTimeoutNotified(ctx context.Context, commandID string) error {
	_, err := store.pool.Exec(ctx, `update device_command set published_at=now(),last_error='device acknowledgement timeout' where command_id=$1 and status='published'`, commandID)
	return err
}
