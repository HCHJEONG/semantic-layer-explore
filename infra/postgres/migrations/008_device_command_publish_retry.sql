alter table device_command
  add column if not exists publish_attempts integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists failure_code text;

alter table device_command drop constraint if exists device_command_status_check;
alter table device_command
  add constraint device_command_status_check
  check (status in ('pending', 'publishing', 'retrying', 'published', 'finalizing', 'succeeded', 'failed'));

create index if not exists idx_device_command_retry
  on device_command (status, next_attempt_at, requested_at);
