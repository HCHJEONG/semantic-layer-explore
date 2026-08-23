create table if not exists workspace_event (
  id bigserial primary key,
  event_id text not null unique,
  type text not null,
  source_type text not null,
  source_id text not null,
  payload jsonb not null,
  occurred_at timestamptz not null
);

create index if not exists idx_workspace_event_occurred_at
  on workspace_event (occurred_at desc, id desc);

create index if not exists idx_workspace_event_source
  on workspace_event (source_type, source_id, id desc);
