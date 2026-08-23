package persistence

import (
	"context"
	"encoding/json"
	"time"
)

type Sensor struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Type          string `json:"type"`
	Unit          string `json:"unit"`
	LatestReading any    `json:"latestReading"`
}
type Device struct {
	ID    string         `json:"id"`
	Name  string         `json:"name"`
	Type  string         `json:"type"`
	State map[string]any `json:"state"`
}
type Rule struct {
	ID              string         `json:"id"`
	Name            string         `json:"name"`
	Description     string         `json:"description"`
	Condition       map[string]any `json:"condition"`
	Action          map[string]any `json:"action"`
	Enabled         bool           `json:"enabled"`
	CooldownSeconds int            `json:"cooldownSeconds"`
	LastTriggeredAt *string        `json:"lastTriggeredAt"`
	CreatedAt       string         `json:"createdAt"`
	UpdatedAt       string         `json:"updatedAt"`
}

func (store *Store) ListSensors(ctx context.Context) ([]Sensor, error) {
	rows, err := store.pool.Query(ctx, `select s.id,s.name,s.type,s.unit,t.event_id,t.payload,t.measured_at,t.source from sensors s left join lateral (select event_id,payload,measured_at,source from telemetry_event where sensor_id=s.id order by measured_at desc limit 1) t on true where s.enabled order by case s.type when 'temperature' then 1 when 'light' then 2 when 'distance' then 3 when 'button' then 4 else 5 end,s.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Sensor, 0)
	for rows.Next() {
		var item Sensor
		var eventID *string
		var payload []byte
		var measuredAt *time.Time
		var source *string
		if err := rows.Scan(&item.ID, &item.Name, &item.Type, &item.Unit, &eventID, &payload, &measuredAt, &source); err != nil {
			return nil, err
		}
		if eventID != nil {
			var body map[string]any
			_ = json.Unmarshal(payload, &body)
			item.LatestReading = map[string]any{"eventId": *eventID, "sensorId": item.ID, "sensorType": item.Type, "value": body["value"], "unit": item.Unit, "measuredAt": measuredAt.UTC().Format(time.RFC3339), "source": *source}
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (store *Store) ListDevices(ctx context.Context) ([]Device, error) {
	rows, err := store.pool.Query(ctx, `select id,name,type,state from devices where enabled order by case type when 'led' then 1 when 'servo' then 2 when 'buzzer' then 3 when 'relay' then 4 else 5 end,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Device, 0)
	for rows.Next() {
		var item Device
		var state []byte
		if err := rows.Scan(&item.ID, &item.Name, &item.Type, &state); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(state, &item.State); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func scanRule(row interface{ Scan(...any) error }) (Rule, error) {
	var item Rule
	var condition, action []byte
	var last *time.Time
	var created, updated time.Time
	err := row.Scan(&item.ID, &item.Name, &item.Description, &condition, &action, &item.Enabled, &item.CooldownSeconds, &last, &created, &updated)
	if err != nil {
		return item, err
	}
	if err = json.Unmarshal(condition, &item.Condition); err != nil {
		return item, err
	}
	if err = json.Unmarshal(action, &item.Action); err != nil {
		return item, err
	}
	if last != nil {
		s := last.UTC().Format(time.RFC3339Nano)
		item.LastTriggeredAt = &s
	}
	item.CreatedAt = created.UTC().Format(time.RFC3339Nano)
	item.UpdatedAt = updated.UTC().Format(time.RFC3339Nano)
	return item, nil
}

const ruleColumns = `id,name,description,condition,action,enabled,cooldown_seconds,last_triggered_at,created_at,updated_at`

func (store *Store) ListRules(ctx context.Context) ([]Rule, error) {
	rows, err := store.pool.Query(ctx, `select `+ruleColumns+` from rules order by created_at,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Rule, 0)
	for rows.Next() {
		item, err := scanRule(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (store *Store) GetRule(ctx context.Context, id string) (Rule, error) {
	return scanRule(store.pool.QueryRow(ctx, `select `+ruleColumns+` from rules where id=$1`, id))
}
func (store *Store) CreateRule(ctx context.Context, item Rule) (Rule, error) {
	condition, _ := json.Marshal(item.Condition)
	action, _ := json.Marshal(item.Action)
	return scanRule(store.pool.QueryRow(ctx, `insert into rules(id,name,description,condition,action,enabled,cooldown_seconds) values($1,$2,$3,$4,$5,$6,$7) returning `+ruleColumns, item.ID, item.Name, item.Description, condition, action, item.Enabled, item.CooldownSeconds))
}
func (store *Store) UpdateRule(ctx context.Context, item Rule) (Rule, error) {
	condition, _ := json.Marshal(item.Condition)
	action, _ := json.Marshal(item.Action)
	return scanRule(store.pool.QueryRow(ctx, `update rules set name=$2,description=$3,condition=$4,action=$5,enabled=$6,cooldown_seconds=$7,updated_at=now() where id=$1 returning `+ruleColumns, item.ID, item.Name, item.Description, condition, action, item.Enabled, item.CooldownSeconds))
}
func (store *Store) SetRuleEnabled(ctx context.Context, id string, enabled bool) (Rule, error) {
	return scanRule(store.pool.QueryRow(ctx, `update rules set enabled=$2,updated_at=now() where id=$1 returning `+ruleColumns, id, enabled))
}
func (store *Store) DeleteRule(ctx context.Context, id string) (bool, error) {
	tag, err := store.pool.Exec(ctx, `delete from rules where id=$1`, id)
	return tag.RowsAffected() > 0, err
}
func (store *Store) GetDevice(ctx context.Context, id string) (Device, error) {
	var item Device
	var state []byte
	err := store.pool.QueryRow(ctx, `select id,name,type,state from devices where id=$1 and enabled`, id).Scan(&item.ID, &item.Name, &item.Type, &state)
	if err == nil {
		err = json.Unmarshal(state, &item.State)
	}
	return item, err
}
func (store *Store) UpdateDeviceState(ctx context.Context, id string, state map[string]any) (Device, error) {
	body, _ := json.Marshal(state)
	var item Device
	var raw []byte
	err := store.pool.QueryRow(ctx, `update devices set state=$2,updated_at=now() where id=$1 and enabled returning id,name,type,state`, id, body).Scan(&item.ID, &item.Name, &item.Type, &raw)
	if err == nil {
		err = json.Unmarshal(raw, &item.State)
	}
	return item, err
}

func (store *Store) UpdateDeviceStateWithEvent(ctx context.Context, id string, state map[string]any, eventID string, payload map[string]any, occurredAt time.Time) (Device, error) {
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return Device{}, err
	}
	defer tx.Rollback(ctx)
	body, _ := json.Marshal(state)
	eventBody, _ := json.Marshal(payload)
	var item Device
	var raw []byte
	err = tx.QueryRow(ctx, `update devices set state=$2,updated_at=$3 where id=$1 and enabled returning id,name,type,state`, id, body, occurredAt).Scan(&item.ID, &item.Name, &item.Type, &raw)
	if err != nil {
		return item, err
	}
	if err = json.Unmarshal(raw, &item.State); err != nil {
		return item, err
	}
	if _, err = tx.Exec(ctx, `insert into workspace_event(event_id,type,source_type,source_id,payload,occurred_at) values($1,'device.command.succeeded','device',$2,$3,$4)`, eventID, id, eventBody, occurredAt); err != nil {
		return item, err
	}
	return item, tx.Commit(ctx)
}
