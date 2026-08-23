create table if not exists device_command (
  command_id text primary key,
  device_id text not null references devices(id),
  payload jsonb not null,
  status text not null check (status in ('pending', 'published', 'succeeded', 'failed')),
  requested_at timestamptz not null,
  published_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  last_error text
);

create index if not exists idx_device_command_dispatch
  on device_command (status, requested_at);

create index if not exists idx_device_command_device
  on device_command (device_id, requested_at desc);
