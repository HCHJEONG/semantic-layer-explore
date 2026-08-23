# Current State Inventory

## Scope

This document records the repository state before the second expansion
scaffolding begins. It is based on the local tree and project files inspected on
2026-08-23.

## Repository Shape

- The repository is a root-level Next.js application. The existing root
  `app/`, `components/`, `lib/`, `domain/`, `runtime/`, `adapters/`, `db/`, and
  `drizzle/` directories are active and should stay in place.
- There is no `frontend/` directory, and the Next.js app has not been moved.
- There is no current `api/`, `worker/`, `contracts/`, `infra/`,
  `graph-worker/`, `loadtest/`, or root `compose.yaml`.
- `.fordeploy/deploy.sh` exists under `.fordeploy/`; it was not inspected or
  modified for this inventory because the current task does not require touching
  deployment automation.
- The Git worktree was clean before changes in this session.

## Next.js Baseline

- Runtime: Next.js `16.2.6`, React `19.2.6`, TypeScript `5.9.3`, Node engine
  `>=22.13.0`.
- Package manager files present: `package.json` and `package-lock.json`.
- App Router is used through `app/` and route handlers under `app/api/**`.
- Main UI files include:
  - `app/page.tsx`
  - `app/client-app.tsx`
  - `components/shell/app-shell.tsx`
  - `components/dashboard/workspace-dashboard.tsx`
  - `components/ontology/*`
  - `components/ai/ask-ai.tsx`
  - `components/rules/rule-studio.tsx`
- API routes are implemented as Next.js route handlers. No server actions were
  found in the inventory pass.
- The current event stream uses SSE at `app/api/events/stream/route.ts`.
  It polls the event store every 2 seconds and sends heartbeats. No WebSocket
  implementation was found.
- UI data access goes through local Next.js API routes, which call runtime,
  service, and store layers inside the same Node process.

## Current API Route Inventory

- Semantic layer:
  - `GET`, `POST /api/classes`
  - `GET`, `POST /api/properties`
  - `GET`, `POST /api/individuals`
  - `GET /api/relations`
  - `GET /api/ontology`
- Runtime state:
  - `GET /api/state`
  - `GET /api/sensors`
  - `GET /api/devices`
  - `POST /api/devices/[deviceId]/commands`
  - `GET /api/events`
  - `GET /api/events/stream`
- Rules:
  - `GET`, `POST /api/rules`
  - `GET`, `PATCH`, `DELETE /api/rules/[ruleId]`
  - `POST /api/rules/[ruleId]/enable`
  - `POST /api/rules/[ruleId]/disable`
- Simulator:
  - `GET`, `POST /api/simulator/status`
  - `POST /api/simulator/start`
  - `POST /api/simulator/stop`
  - `POST /api/simulator/scenarios/[scenario]`
  - `POST /api/simulator/sensors/[sensorId]/readings`
- AI and explainability:
  - `POST /api/ai/chat`
  - `POST /api/ai/rules/propose`
  - `POST /api/ai/explain-event`
- Operations:
  - `GET /api/health`
  - `GET /api/ready`

## Domain Model

The current source-of-truth domain files are:

- `domain/physical.ts`: sensors, devices, readings, device commands, command
  results, connection status, simulator scenarios, and workspace state.
- `domain/rule.ts`: rule conditions, actions, persisted rule records, rule
  input, and patch validation.
- `domain/ontology.ts`: classes, properties, individuals, relations, complete
  ontology response, UI selection types, and relation-as-triple vocabulary.

These files are the safest source for second-stage message contract alignment.

## SQLite And Store Boundary

- SQLite is implemented with `better-sqlite3` and Drizzle ORM.
- Database connection and automatic migration live in `db/index.ts`.
- Default DB path is `data/ai-workspace.sqlite`, overridable by
  `DATABASE_PATH`.
- SQLite pragmas are enabled at connection time:
  - `journal_mode = WAL`
  - `foreign_keys = ON`
  - `busy_timeout = 5000`
- Drizzle migrations live in `drizzle/`.
- The active schema is in `db/schema.ts`.

Current tables:

- Semantic metadata:
  - `semantic_classes`
  - `semantic_properties`
  - `semantic_individuals`
  - `semantic_relations`
- Physical runtime:
  - `sensors`
  - `devices`
  - `sensor_readings`
  - `events`
  - `rules`

Store interfaces and implementations live under `lib/stores/`:

- `database-store.ts`
- `events-store.ts`
- `ontology-store.ts`
- `physical-store.ts`
- `rules-store.ts`
- `index.ts`

`getDb()` is currently contained by store/database modules, matching the first
implementation plan.

## Runtime, Simulator, And Rules

- `runtime/workspace-runtime.ts` owns the in-process runtime singleton.
- The only implemented physical adapter is the simulator. `PHYSICAL_ADAPTER`
  defaults to `simulator`; any other adapter value currently throws.
- `adapters/physical-workspace-adapter.ts` defines the adapter boundary.
- `adapters/simulator/simulator-adapter.ts` provides four sensors:
  - temperature
  - light
  - distance
  - button
- The simulator provides four virtual devices:
  - LED
  - servo
  - buzzer
  - relay
- Sensor readings are emitted by simulator callback into the runtime. The
  runtime persists the reading, writes a `sensor.reading` event, and enqueues
  deterministic rule evaluation.
- Rule evaluation is serialized and bounded by keeping one pending reading per
  sensor.
- Rule matching is deterministic in `runtime/rule-engine.ts`.
- Retention cleanup is in `runtime/retention.ts`.

There is no MQTT adapter in the current codebase.

## Mastra And LLM

- `@mastra/core` is installed.
- `lib/explain/workflow.ts` defines the Mastra Explain Event workflow.
- `lib/explain/causal-trace.ts` builds deterministic causal traces from stored
  events.
- `lib/ai/llm/provider.ts` defines the provider-neutral LLM interface.
- `lib/ai/llm/gemini-provider.ts` adapts the current Gemini provider.
- `lib/ai/llm/explain-review.ts` supports optional LLM-backed evidence review.
- `EXPLAIN_LLM_REVIEW=enabled` is required for live LLM review; deterministic
  fallback is the default.
- Current Mastra workflow code imports Next.js `server-only` and local store
  modules, so it is not yet worker-runtime-neutral.

## Deployment And Docker

- `.dockerignore` exists.
- No root `Dockerfile` was found in the inventory pass.
- No root `compose.yaml` was found.
- Current README describes source-archive deployment through `.fordeploy`, with
  build on the private EC2 instance for the first baseline.
- The second plan changes the future deployment model to local WSL
  `linux/amd64` image builds and versioned image tar transfer, but that is not
  implemented yet.
- Local AWS instance sizes, running container RSS, PSI, ALB routing, and port
  conflicts were not verified in this repository inventory.

## Gaps Relative To The Second Plan

- No language-neutral JSON Schema contracts exist yet.
- No Go Gateway exists yet.
- No NestJS/Mastra Kafka worker exists yet.
- No PostgreSQL migrations or operational schema exist yet.
- No Kafka, Mosquitto, or Neo4j infrastructure config exists yet.
- No Rust graph projection worker exists yet.
- No root Compose stack exists yet.
- No telemetry path currently passes through
  `MQTT -> Go Gateway -> Kafka -> NestJS Worker -> PostgreSQL`.
- No worker scale or Kafka partition assignment has been verified yet.
- No Neo4j projection, graph read endpoint, or graph profile exists yet.

## Initial Scaffolding Plan

1. Add `contracts/` with JSON Schema files as the language-neutral source for
   telemetry, command, command result, agent result, audit event, semantic graph,
   Scene IR, action request, and session result envelopes.
2. Add `api/` as a Go gateway skeleton with HTTP health/ready endpoints,
   telemetry ingestion endpoint, MQTT subscriber skeleton, Kafka producer
   boundary, query boundary, session/SSH placeholders, and contract validation.
3. Add `worker/` as one NestJS service/image with Kafka consumer skeleton,
   schema validation, idempotency placeholder, manual offset flow boundaries,
   PostgreSQL persistence boundary, audit boundary, and Mastra migration
   placeholder.
4. Add `infra/` with PostgreSQL migrations and minimal Kafka/Mosquitto/Neo4j
   config files.
5. Add `graph-worker/` as a Rust projector skeleton for future
   `semantic.graph.rebuild` and `semantic.relation.changed` consumption.
6. Add root `compose.yaml` with `frontend`, `api`, scalable `worker`, `kafka`,
   `postgres`, `mosquitto`, `migrate`, and graph-profile `neo4j` and
   `graph-worker` services.

The first implementation target should be a buildable skeleton plus a minimal
telemetry vertical slice. It should not claim exactly-once semantics, should not
call Mastra for every telemetry event, and should not let Go directly persist
raw telemetry to PostgreSQL.
