create table if not exists telemetry_event_dedup (
  event_id text primary key,
  first_processed_at timestamptz not null default now()
);

create table if not exists retention_cleanup_state (
  name text primary key,
  last_started_at timestamptz
);

insert into retention_cleanup_state (name) values ('postgres-retention')
on conflict (name) do nothing;

insert into telemetry_event_dedup (event_id, first_processed_at)
select event_id, processed_at from telemetry_event
on conflict (event_id) do nothing;

create index if not exists idx_telemetry_event_retention
  on telemetry_event (processed_at, id);

create index if not exists idx_workspace_sensor_reading_retention
  on workspace_event (occurred_at, id)
  where type = 'sensor.reading';

create index if not exists idx_audit_event_retention
  on audit_event (occurred_at, id)
  where type <> 'rule.matched';
