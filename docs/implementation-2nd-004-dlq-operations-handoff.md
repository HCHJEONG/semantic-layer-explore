# 2nd Implementation 004: Telemetry DLQ And Operations Summary

## Purpose

This handoff records the minimal failure-handling and operations visibility work
after the MQTT simulator path was deployed and verified on `aws-demo`.

The goal was to make worker-side telemetry failures visible through
PostgreSQL-backed state that Go can expose to Next.js, rather than expecting Go
to infer worker failures directly from Kafka.

## Implemented Scope

- Added `contracts/dead-letter.schema.json` for `dead-letter.v1` messages.
- Added PostgreSQL migration `002_dead_letter_events.sql`.
- Added `dead_letter_event` as the operations record for failed telemetry
  processing.
- Added worker-side dead-letter handling:
  - parse/validation failures are classified as `telemetry.validation`;
  - processing failures are classified as `telemetry.processing`;
  - empty Kafka message values are treated as failed telemetry input;
  - worker records a row in PostgreSQL;
  - worker publishes the dead-letter envelope to Kafka topic `dead-letter`;
  - worker commits the source offset only after the dead-letter path succeeds.
- Added Go Gateway PostgreSQL read access for operations summary.
- Added `GET /operations/summary` to the Go Gateway.
- Added Next.js BFF route `GET /api/operations/summary`.
- Added dashboard metric cards for distributed telemetry count and dead-letter
  count.
- Added Compose environment wiring for `DATABASE_URL` in the Go API and
  `KAFKA_DEAD_LETTER_TOPIC` in the worker.
- Updated local and AWS Compose dependencies so the Go API starts after
  migrations complete.

## Runtime Shape

Failure path:

```text
Kafka telemetry.raw
  -> NestJS worker parse/processing failure
  -> PostgreSQL dead_letter_event
  -> Kafka dead-letter
  -> source offset commit
```

Operations read path:

```text
Next.js dashboard
  -> Next.js /api/operations/summary
  -> Go /operations/summary
  -> PostgreSQL telemetry_event + dead_letter_event
```

## Verification Performed

- Worker TypeScript build: `npm run build` in `worker/`
- Go tests: Dockerized `go test ./...`
- Next.js lint: `npm run lint`
- Next.js production build: `npm run build`
- Local Compose config with `graph` and `simulator` profiles
- AWS Compose config with `graph` and `simulator` profiles
- Deployment script syntax: `bash -n .fordeploy/deploy.sh`
- Docker image builds: `docker compose build api worker`

## Not Yet Verified

- End-to-end invalid telemetry smoke from Kafka `telemetry.raw` into
  `dead_letter_event`.
- AWS deployment of this DLQ/operations change.
- UI screenshot verification after deployment.
- DLQ replay tooling.
- Retry backoff policy for transient PostgreSQL failures.

## Boundaries

This work does not implement the Rust graph worker, Neo4j projection, or Cypher
queries. It only makes telemetry worker failures observable through PostgreSQL
and Go/Next.js read APIs.
