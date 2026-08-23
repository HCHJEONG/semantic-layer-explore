alter table device_command
  add column if not exists dispatch_owner text,
  add column if not exists lease_until timestamptz;

create index if not exists idx_device_command_dispatch_lease
  on device_command (status, lease_until, next_attempt_at, requested_at);
