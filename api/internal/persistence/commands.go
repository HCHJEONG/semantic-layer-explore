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

func (store *Store) ClaimDispatchableCommands(ctx context.Context, owner string, lease time.Duration, limit int) ([]PendingCommand, error) {
	rows, err := store.pool.Query(ctx, `with candidates as (
  select command_id from device_command
  where status='pending'
     or (status='retrying' and next_attempt_at<=now())
     or (status='publishing' and (lease_until is null or lease_until<=now()))
  order by requested_at for update skip locked limit $1
) update device_command d set status='publishing',publish_attempts=d.publish_attempts+1,last_attempt_at=now(),next_attempt_at=null,dispatch_owner=$2,lease_until=now()+$3::interval
from candidates c where d.command_id=c.command_id returning d.command_id,d.device_id,d.payload,d.publish_attempts,coalesce(d.last_error,'')`, limit, owner, lease.String())
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

func (store *Store) MarkCommandPublished(ctx context.Context, commandID, owner string) error {
	tag, err := store.pool.Exec(ctx, `update device_command set status='published',published_at=now(),last_error=null,next_attempt_at=null,dispatch_owner=null,lease_until=null where command_id=$1 and status='publishing' and dispatch_owner=$2`, commandID, owner)
	return expectClaimedCommand(tag.RowsAffected(), commandID, owner, err)
}

func (store *Store) ScheduleCommandRetry(ctx context.Context, command PendingCommand, owner string, publishError error, nextAttempt time.Time, maxAttempts int) error {
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, `update device_command set status='retrying',last_error=$2,next_attempt_at=$3,failure_code='mqtt.publish.failed',dispatch_owner=null,lease_until=null where command_id=$1 and status='publishing' and dispatch_owner=$4`, command.CommandID, publishError.Error(), nextAttempt, owner)
	if err = expectClaimedCommand(tag.RowsAffected(), command.CommandID, owner, err); err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]any{"commandId": command.CommandID, "attempt": command.PublishAttempts, "maxAttempts": maxAttempts, "error": publishError.Error(), "nextAttemptAt": nextAttempt.UTC().Format(time.RFC3339Nano)})
	if _, err = tx.Exec(ctx, `insert into workspace_event(event_id,type,source_type,source_id,payload,occurred_at) values($1,'device.command.publish-retrying','device',$2,$3::jsonb,now()) on conflict(event_id) do nothing`, command.CommandID+":retry:"+fmt.Sprint(command.PublishAttempts), command.DeviceID, payload); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (store *Store) MarkCommandPublishExhausted(ctx context.Context, commandID, owner string, publishError error) error {
	tag, err := store.pool.Exec(ctx, `update device_command set status='finalizing',last_error=$2,failure_code='mqtt.publish.exhausted',next_attempt_at=now(),dispatch_owner=null,lease_until=null where command_id=$1 and status='publishing' and dispatch_owner=$3`, commandID, publishError.Error(), owner)
	return expectClaimedCommand(tag.RowsAffected(), commandID, owner, err)
}

func (store *Store) ClaimCommandsAwaitingFailureResult(ctx context.Context, owner string, lease time.Duration, limit int) ([]PendingCommand, error) {
	rows, err := store.pool.Query(ctx, `with candidates as (
  select command_id from device_command
  where status='finalizing' and (next_attempt_at is null or next_attempt_at<=now()) and (lease_until is null or lease_until<=now())
  order by last_attempt_at for update skip locked limit $1
) update device_command d set dispatch_owner=$2,lease_until=now()+$3::interval
from candidates c where d.command_id=c.command_id returning d.command_id,d.device_id,d.payload,d.publish_attempts,coalesce(d.last_error,'mqtt publish failed')`, limit, owner, lease.String())
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

func (store *Store) DelayCommandFailureResult(ctx context.Context, commandID, owner string) error {
	tag, err := store.pool.Exec(ctx, `update device_command set next_attempt_at=now()+interval '2 seconds',dispatch_owner=null,lease_until=null where command_id=$1 and status='finalizing' and dispatch_owner=$2`, commandID, owner)
	return expectClaimedCommand(tag.RowsAffected(), commandID, owner, err)
}

func (store *Store) ClaimTimedOutCommands(ctx context.Context, owner string, timeout, lease time.Duration, limit int) ([]PendingCommand, error) {
	rows, err := store.pool.Query(ctx, `with candidates as (
  select command_id from device_command
  where status='published' and published_at < now()-$1::interval and (lease_until is null or lease_until<=now())
  order by published_at for update skip locked limit $2
) update device_command d set dispatch_owner=$3,lease_until=now()+$4::interval
from candidates c where d.command_id=c.command_id returning d.command_id,d.device_id,d.payload,d.publish_attempts,coalesce(d.last_error,'')`, timeout.String(), limit, owner, lease.String())
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

func (store *Store) MarkCommandTimeoutNotified(ctx context.Context, commandID, owner string) error {
	tag, err := store.pool.Exec(ctx, `update device_command set published_at=now(),last_error='device acknowledgement timeout',dispatch_owner=null,lease_until=null where command_id=$1 and status='published' and dispatch_owner=$2`, commandID, owner)
	return expectClaimedCommand(tag.RowsAffected(), commandID, owner, err)
}

func expectClaimedCommand(rows int64, commandID, owner string, err error) error {
	if err != nil {
		return err
	}
	if rows != 1 {
		return fmt.Errorf("device command claim lost: commandId=%s owner=%s", commandID, owner)
	}
	return nil
}
