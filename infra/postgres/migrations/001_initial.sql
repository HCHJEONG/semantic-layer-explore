create table if not exists telemetry_event (
  id bigserial primary key,
  event_id text not null unique,
  device_id text not null,
  sensor_id text not null,
  sequence bigint not null,
  measured_at timestamptz not null,
  source text not null,
  payload jsonb not null,
  kafka_topic text not null,
  kafka_partition integer not null,
  kafka_offset text not null,
  processed_at timestamptz not null default now()
);

create index if not exists idx_telemetry_event_device_sequence
  on telemetry_event (device_id, sequence);

create table if not exists audit_event (
  id bigserial primary key,
  audit_id text not null unique,
  type text not null,
  occurred_at timestamptz not null,
  payload jsonb not null,
  correlation_id text
);

create table if not exists outbox_event (
  id bigserial primary key,
  event_id text not null unique,
  topic text not null,
  key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
