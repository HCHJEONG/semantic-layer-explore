# 2nd Implementation 005: Worker Mastra Decision Boundary

## Purpose

This handoff records the first concrete worker-side AI decision boundary after
the MQTT, persistence, and DLQ paths were verified.

Before this work, Mastra/LLM behavior remained centered in the root Next.js
backend. The NestJS worker only had a placeholder `MastraDecisionService`.

## Implemented Scope

- Added a conditional worker-side telemetry decision boundary.
- Kept general telemetry on the deterministic path with no LLM invocation.
- Added environment-controlled worker settings:
  - `MASTRA_TELEMETRY_MODE`, default `dry-run`
  - `MASTRA_TEMPERATURE_THRESHOLD`, default `31.5`
  - `MASTRA_DISTANCE_THRESHOLD`, default `10`
- Aligned the default temperature threshold with the existing Next.js simulator
  `high-temperature` scenario value of `31.5`.
- Added dry-run agent result payloads shaped as `agent-result.v1`.
- Recorded worker AI decisions into PostgreSQL `audit_event` as
  `mastra.telemetry.decision`.
- Recorded worker AI boundary failures into PostgreSQL `audit_event` as
  `mastra.telemetry.failed`, without failing the already-persisted telemetry.
- Extended Go `/operations/summary` with:
  - `mastraDecisionCount`
  - `latestMastraDecision`
- Extended Next.js `/api/operations/summary` and dashboard metrics with
  `AI decisions`.

## Runtime Shape

Normal telemetry path remains:

```text
MQTT / HTTP telemetry
  -> Go Gateway
  -> Kafka telemetry.raw
  -> NestJS worker
  -> PostgreSQL telemetry_event
  -> source offset commit
```

Conditional worker AI boundary:

```text
Persisted telemetry
  -> trigger classification
  -> policy gate
  -> dry-run Mastra boundary result
  -> PostgreSQL audit_event
```

This does not invoke a live LLM by default.

## Verification Performed

- Worker TypeScript build: `npm run build` in `worker/`
- Go tests: Dockerized `go test ./...`
- Next.js lint: `npm run lint`
- Next.js production build: `npm run build`
- Local and AWS Compose config rendering with `graph` and `simulator` profiles
- Local high-temperature E2E smoke:
  - `SIMULATOR_SCENARIO=high-temperature`
  - telemetry persisted to `telemetry_event`
  - worker logged `Mastra telemetry decision recorded`
  - Go `/operations/summary` returned `mastraDecisionCount: 7`
  - Next.js `/api/operations/summary` returned the same count
  - Kafka consumer lag returned to 0
  - local stack cleaned up with `docker compose --profile simulator down -v`

## Not Yet Completed

- Existing Next.js Explain Event Mastra workflow has not been fully moved to the
  worker.
- No live LLM is invoked from the worker by default.
- No `agent.result` Kafka topic publication is implemented yet.
- AWS deployment of this worker Mastra boundary change has not been verified.
- UI screenshot verification after deployment has not been performed.

## Boundary Statement

This work proves that the NestJS worker now has a real conditional AI decision
boundary and durable audit record. It should not be described as a full
migration of the existing Next.js Mastra Explain Event workflow.
