package persistence

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

type PendingCommand struct {
	CommandID       string
	DeviceID        string
	Payload         []byte
	PublishAttempts int
	LastError       string
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

func (store *Store) ClaimDispatchableCommands(ctx context.Context, limit int) ([]PendingCommand, error) {
	rows, err := store.pool.Query(ctx, `with candidates as (
  select command_id from device_command
  where status='pending' or (status='retrying' and next_attempt_at<=now())
  order by requested_at for update skip locked limit $1
) update device_command d set status='publishing',publish_attempts=d.publish_attempts+1,last_attempt_at=now(),next_attempt_at=null
from candidates c where d.command_id=c.command_id returning d.command_id,d.device_id,d.payload,d.publish_attempts,coalesce(d.last_error,'')`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]PendingCommand, 0)
	for rows.Next() {
		var item PendingCommand
		if err := rows.Scan(&item.CommandID, &item.DeviceID, &item.Payload, &item.PublishAttempts, &item.LastError); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (store *Store) MarkCommandPublished(ctx context.Context, commandID string) error {
	_, err := store.pool.Exec(ctx, `update device_command set status='published',published_at=now(),last_error=null,next_attempt_at=null where command_id=$1 and status='publishing'`, commandID)
	return err
}

func (store *Store) ScheduleCommandRetry(ctx context.Context, command PendingCommand, publishError error, nextAttempt time.Time, maxAttempts int) error {
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `update device_command set status='retrying',last_error=$2,next_attempt_at=$3,failure_code='mqtt.publish.failed' where command_id=$1 and status='publishing'`, command.CommandID, publishError.Error(), nextAttempt); err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]any{"commandId": command.CommandID, "attempt": command.PublishAttempts, "maxAttempts": maxAttempts, "error": publishError.Error(), "nextAttemptAt": nextAttempt.UTC().Format(time.RFC3339Nano)})
	if _, err = tx.Exec(ctx, `insert into workspace_event(event_id,type,source_type,source_id,payload,occurred_at) values($1,'device.command.publish-retrying','device',$2,$3::jsonb,now()) on conflict(event_id) do nothing`, command.CommandID+":retry:"+fmt.Sprint(command.PublishAttempts), command.DeviceID, payload); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (store *Store) MarkCommandPublishExhausted(ctx context.Context, commandID string, publishError error) error {
	_, err := store.pool.Exec(ctx, `update device_command set status='finalizing',last_error=$2,failure_code='mqtt.publish.exhausted',next_attempt_at=now() where command_id=$1 and status='publishing'`, commandID, publishError.Error())
	return err
}

func (store *Store) CommandsAwaitingFailureResult(ctx context.Context, limit int) ([]PendingCommand, error) {
	rows, err := store.pool.Query(ctx, `select command_id,device_id,payload,publish_attempts,coalesce(last_error,'mqtt publish failed') from device_command where status='finalizing' and (next_attempt_at is null or next_attempt_at<=now()) order by last_attempt_at limit $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]PendingCommand, 0)
	for rows.Next() {
		var item PendingCommand
		if err := rows.Scan(&item.CommandID, &item.DeviceID, &item.Payload, &item.PublishAttempts, &item.LastError); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (store *Store) DelayCommandFailureResult(ctx context.Context, commandID string) error {
	_, err := store.pool.Exec(ctx, `update device_command set next_attempt_at=now()+interval '2 seconds' where command_id=$1 and status='finalizing'`, commandID)
	return err
}

func (store *Store) TimedOutCommands(ctx context.Context, timeout time.Duration, limit int) ([]PendingCommand, error) {
	rows, err := store.pool.Query(ctx, `select command_id,device_id,payload,publish_attempts,coalesce(last_error,'') from device_command where status='published' and published_at < now()-$1::interval order by published_at limit $2`, timeout.String(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]PendingCommand, 0)
	for rows.Next() {
		var item PendingCommand
		if err := rows.Scan(&item.CommandID, &item.DeviceID, &item.Payload, &item.PublishAttempts, &item.LastError); err != nil {
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
