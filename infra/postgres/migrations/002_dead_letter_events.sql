create table if not exists dead_letter_event (
  id bigserial primary key,
  dead_letter_id text not null unique,
  source_topic text not null,
  source_partition integer not null,
  source_offset text not null,
  key text,
  reason text not null,
  error_message text not null,
  payload text,
  payload_json jsonb,
  failed_at timestamptz not null default now()
);

create unique index if not exists idx_dead_letter_event_source_position
  on dead_letter_event (source_topic, source_partition, source_offset);

create index if not exists idx_dead_letter_event_failed_at
  on dead_letter_event (failed_at desc);
