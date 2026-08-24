# Third-Stage Handoff 002: PostgreSQL Retention Cleanup

Date: 2026-08-24

## Scope

This handoff activates bounded PostgreSQL retention cleanup in the scalable NestJS worker using the existing AWS environment contract:

```text
READING_RETENTION_DAYS=1
AUDIT_EVENT_RETENTION_DAYS=7
RETENTION_CLEANUP_INTERVAL_MS=3600000
RETENTION_BATCH_SIZE=5000
```

The worker runs cleanup once at startup and then at the configured interval. Invalid, zero, negative, fractional, or unsafe integer values fall back to the defaults above.

## Deleted and retained data

Each cluster-wide cleanup run deletes at most `RETENTION_BATCH_SIZE` rows from each eligible set:

- `telemetry_event` rows older than `READING_RETENTION_DAYS`, using `processed_at`;
- duplicated `workspace_event` rows with `type='sensor.reading'` older than the same reading retention, using `occurred_at`;
- `audit_event` rows older than `AUDIT_EVENT_RETENTION_DAYS`, except `type='rule.matched'`.

The cleanup deliberately retains:

- current sensor/device state and semantic data;
- rule, device-command, and other non-reading workspace events;
- `rule.matched` audit rows used as deterministic rule idempotency markers;
- compact telemetry `eventId` tombstones.

## Idempotency after payload deletion

Migration `010_postgres_retention.sql` adds `telemetry_event_dedup` and backfills it from existing telemetry. New telemetry transactions insert the tombstone before the payload row. If the `eventId` already exists, the worker treats the record as duplicate even when its old `telemetry_event` payload has already been deleted.

The tombstone contains only `event_id` and `first_processed_at`; it is intentionally retained beyond the reading payload window. This prevents a Kafka or MQTT redelivery older than one day from recreating telemetry and physical-rule effects merely because retention removed the larger payload row.

## Multi-worker coordination

Migration 010 also adds one `retention_cleanup_state` row. A cleanup transaction:

1. acquires a PostgreSQL advisory transaction lock;
2. atomically advances the cluster-wide `last_started_at` only when the configured interval has elapsed;
3. runs bounded `DELETE ... FOR UPDATE SKIP LOCKED` statements;
4. commits all three cleanup categories together.

This allows every worker replica to contain the same scheduler code while only one cleanup starts for the worker cluster in an interval. A process failure rolls back the schedule claim and deletes together.

## Storage behavior

PostgreSQL deletion does not shrink the allocated EBS volume by itself. It makes table pages reclaimable by PostgreSQL autovacuum and reusable by future writes, which limits continued EBS growth. The new partial/time indexes keep retention selection bounded. Actual EBS free space, PostgreSQL relation size, dead tuples, and autovacuum behavior should still be monitored.

## Verification

An isolated Compose project used two worker replicas, a 10-minute interval, and batch size 2. Three old rows were inserted into each eligible category, together with current and protected rows.

First run:

```text
retention cleanup completed telemetry=2 sensorReadings=2 audit=2 batchSize=2
```

Only one of the two workers acquired the cluster schedule. After the first run, one old row remained in each eligible category. The old non-reading workspace event, old `rule.matched` marker, all three dedup tombstones, and all current rows remained.

After resetting the test schedule and restarting both workers, exactly one worker performed the second run:

```text
retention cleanup completed telemetry=1 sensorReadings=1 audit=1 batchSize=2
```

All eligible old payload rows were gone. Re-publishing deleted `eventId=retention-old-1` through Kafka produced `duplicate telemetry skipped`, and the deleted telemetry payload was not recreated.

Commands run:

```text
cd worker && npm test
docker compose config --quiet
docker compose -f .fordeploy/compose.aws-demo.yaml config --quiet
docker compose -p semantic-retention-test ... up -d --build --scale worker=2 worker
psql retention fixture and verification queries
kafka-console-producer duplicate-event verification
git diff --check
```

No AWS deployment was performed. The AWS maintainer must deploy the updated worker image, Compose environment wiring, and migration 010 before these settings become active on `aws-demo`.
