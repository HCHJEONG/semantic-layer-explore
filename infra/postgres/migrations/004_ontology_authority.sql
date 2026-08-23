create index if not exists idx_outbox_event_unpublished
  on outbox_event (id)
  where published_at is null;
