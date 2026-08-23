create table if not exists sensors (
  id text primary key,
  name text not null,
  type text not null check (type in ('temperature', 'light', 'distance', 'button')),
  unit text not null check (unit in ('celsius', 'lux', 'centimeter', 'boolean')),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists devices (
  id text primary key,
  name text not null,
  type text not null check (type in ('led', 'servo', 'buzzer', 'relay')),
  state jsonb not null default '{"status":"off"}'::jsonb,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists rules (
  id text primary key,
  name text not null,
  description text not null,
  condition jsonb not null,
  action jsonb not null,
  enabled boolean not null default true,
  cooldown_seconds integer not null default 10 check (cooldown_seconds between 0 and 86400),
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rules_enabled_sensor
  on rules ((condition->>'sensorId')) where enabled;

insert into sensors (id, name, type, unit, enabled, created_at) values
  ('temperature-01', 'Temperature Sensor', 'temperature', 'celsius', true, '2026-08-04T00:00:00Z'),
  ('light-01', 'Light Sensor', 'light', 'lux', true, '2026-08-04T00:00:00Z'),
  ('distance-01', 'Distance Sensor', 'distance', 'centimeter', true, '2026-08-04T00:00:00Z'),
  ('button-01', 'Button Sensor', 'button', 'boolean', true, '2026-08-04T00:00:00Z')
on conflict (id) do nothing;

insert into devices (id, name, type, state, enabled, updated_at) values
  ('led-01', 'Workspace LED', 'led', '{"status":"off"}', true, '2026-08-04T00:00:00Z'),
  ('servo-01', 'Workspace Servo', 'servo', '{"status":"off","angle":90}', true, '2026-08-04T00:00:00Z'),
  ('buzzer-01', 'Workspace Buzzer', 'buzzer', '{"status":"off"}', true, '2026-08-04T00:00:00Z'),
  ('relay-fan-01', 'Fan Relay', 'relay', '{"status":"off"}', true, '2026-08-04T00:00:00Z')
on conflict (id) do nothing;
