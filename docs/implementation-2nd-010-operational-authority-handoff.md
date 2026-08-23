# Second-Stage Handoff 010: Rules, Sensors, And Devices

Date: 2026-08-23

## Implemented

- PostgreSQL now owns the distributed-runtime `sensors`, `devices`, and `rules` tables.
- Migration 005 seeds the same four sensors and four virtual devices as the SQLite baseline.
- Go exposes sensor/latest-reading, device/state/command, workspace-state, and complete rule CRUD endpoints.
- Next.js `/api/state`, `/api/sensors`, `/api/devices`, device commands, and all rule routes are thin Go BFFs by default.
- `OPERATIONAL_BACKEND=sqlite` preserves the original in-process simulator and rule engine as an explicit legacy standalone mode.
- NestJS reads enabled PostgreSQL rules for each telemetry event and applies numeric or boolean conditions deterministically.
- Rule rows and target device rows are locked while evaluating. Rule cooldown, device state, and `rule.matched` audit evidence commit in one transaction.
- Duplicate Kafka delivery retries deterministic evaluation so a crash after telemetry persistence cannot permanently skip rules. The per-event/per-rule audit ID is also checked as a permanent idempotency marker, preventing reapplication even after cooldown expires.
- Environment-threshold Mastra decisions remain a separate conditional path; telemetry does not invoke an LLM by default.

## Verified

- `go test ./...`
- `cd worker && npm test`: 2 deterministic rule tests passed
- `npm test`: Next build and 11 legacy regression tests passed
- `docker compose config --quiet`
- `docker compose up -d --build --scale worker=2`
- Two workers split six telemetry partitions as `0,1,2` and `3,4,5`
- Next BFF created, patched, disabled, enabled, listed, fetched, and deleted a PostgreSQL rule
- A 32.5 celsius event matched the PostgreSQL rule and changed `relay-fan-01` to `on`
- Re-delivery of the same event left one telemetry row and one `rule.matched` audit row
- Device command validation accepted servo `set-angle: 45` and rejected servo `on`
- `/api/state` returned PostgreSQL latest telemetry and PostgreSQL device states

The E2E records were created in a disposable local Compose volume and the stack was removed after verification.

## Boundaries

- PostgreSQL is authoritative for rules, sensor definitions/latest telemetry reads, and virtual device state in the distributed runtime.
- NestJS owns deterministic telemetry rule evaluation.
- Go owns synchronous operational queries, rule commands, and virtual device state commands.
- Next.js remains the UI/BFF and retains SQLite only for legacy standalone operation.
- Physical MQTT outbound device-command delivery is not implemented in this milestone; current distributed commands update the authoritative virtual state.

## Next Scope

The final migration stage is PostgreSQL-backed `events + Explain causal trace`, including the event timeline/SSE read path and worker-produced causal evidence.
