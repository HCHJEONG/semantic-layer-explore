# BestAiCom Semantic Workspace

[한국어 README](./READMEKor.md) | [Live demo](https://physicalai.penvot.com)

An ontology-first Physical AI workspace designed to evolve from a working
single-application demo into a distributed system capable of processing
high-volume telemetry.

The project combines an explainable Next.js product with Go ingress, partitioned
Kafka streams, horizontally scalable NestJS workers, PostgreSQL, MQTT, Rust, and
Neo4j. The important result is not the number of technologies: ingestion,
processing, operational storage, and semantic projection can scale independently
without discarding the original user experience.

## Why It Matters

An LLM does not inherently understand what a database field, device reading, or
business relationship means. This workspace puts a semantic contract between AI,
APIs, and operational data, then demonstrates how that contract can survive a
transition to distributed, high-throughput processing.

- Ontology-first AI tools instead of direct LLM access to databases or devices
- Deterministic rules and human approval around AI-assisted automation
- Auditable Explain Why traces for device actions
- Kafka partitioning and worker scale-out for increasing telemetry volume
- At-least-once delivery with idempotent PostgreSQL persistence
- Rebuildable Neo4j projections separated from authoritative operational data

## Architecture

The existing user-facing baseline remains at the repository root:

```text
Browser
  -> Next.js UI and API routes
  -> ontology, simulator, rules, events, Explain Why
  -> SQLite + Drizzle
  -> Gemini through an application-owned provider boundary
```

The distributed telemetry path is introduced alongside it:

```text
HTTP telemetry
  -> Go Gateway
  -> Kafka telemetry.raw (6 partitions)
  -> NestJS worker x N (one consumer group)
  -> PostgreSQL
```

The target production path extends the same boundaries:

```text
MQTT devices
  -> Go Gateway
  -> Kafka
  -> NestJS/Mastra worker x N
  -> PostgreSQL authoritative store

semantic.graph.rebuild / semantic.relation.changed
  -> Rust graph worker
  -> Neo4j semantic read model
```

### How It Scales

- **Ingress:** more Go Gateway instances can publish to the same Kafka cluster.
- **Transport:** topic partitions distribute device keys while preserving order
  for a given device.
- **Processing:** the same worker image scales horizontally; Kafka assigns
  partitions across instances in the consumer group.
- **Storage:** PostgreSQL owns operational truth and can be scaled independently
  of application containers.
- **Semantic reads:** Neo4j is an asynchronous, rebuildable projection, so graph
  traversal load does not redefine the source of truth.
- **Capacity:** service replicas, Kafka partitions, and infrastructure profiles
  can grow without collapsing the system back into one runtime or database.

Kafka is asynchronous event transport, not an RPC bus. Synchronous queries,
sessions, and light commands use Go HTTP/WebSocket/SSE boundaries.

## Current Status

| Area | Status |
| --- | --- |
| Next.js ontology and Physical Workspace UI | Implemented |
| SQLite simulator, deterministic rules, events, and audit history | Implemented |
| Gemini tools, Rule Compiler, chat, and Explain Why | Implemented |
| Versioned JSON Schema contracts | Scaffolded; telemetry contract in use |
| Go HTTP ingestion and Kafka producer | Implemented and verified |
| NestJS consumer group and PostgreSQL persistence | Implemented and verified |
| Two-worker partition distribution | Implemented and verified |
| Mosquitto broker | Deployed on the internal network |
| Go MQTT subscriber | Skeleton only |
| Neo4j service | Deployed and startup verified |
| Rust Kafka consumer and Neo4j projection | Skeleton only |
| Go graph queries and Next.js graph drill-down | Skeleton/planned |
| Application-controlled SSH terminal | Skeleton; no OS shell exposed |

The verified AWS vertical slice is:

```text
POST /telemetry
  -> Go accepted and published the event
  -> Kafka assigned it to telemetry.raw
  -> one of two NestJS workers consumed it
  -> PostgreSQL stored eventId, topic, partition, and offset
  -> consumer-group lag returned to zero
```

This verifies `HTTP -> Go -> Kafka -> worker -> PostgreSQL`. It does not claim
that MQTT ingestion or Neo4j projection is complete.

## Runtime Services

The graph profile with `worker=2` creates 11 containers from eight unique images.
Two initialization containers exit after migration and topic creation, leaving
nine long-running services.

| Service | Runtime | Responsibility |
| --- | --- | --- |
| `frontend` | Next.js / TypeScript | UI, BFF routes, semantic workspace |
| `api` | Go | Ingress, Kafka publish, future sessions and graph queries |
| `worker` x2 | NestJS / TypeScript | Kafka poll, validation, idempotency, persistence |
| `postgres` | PostgreSQL | Authoritative distributed operational store |
| `kafka` | Apache Kafka | Partitioned event transport and consumer groups |
| `mosquitto` | MQTT | Internal device messaging broker |
| `neo4j` | Neo4j | Rebuildable semantic read model |
| `graph-worker` | Rust | Kafka-to-Neo4j projector skeleton |

`migrate` and `kafka-init` reuse infrastructure images and exit after successful
initialization. Workers have no HTTP server: KafkaJS polls Kafka, and Kafka
assigns partitions among instances in the same consumer group.

## Delivery Semantics

The implementation deliberately does not claim exactly-once processing:

```text
Kafka at-least-once delivery
+ eventId unique constraint
+ INSERT ... ON CONFLICT DO NOTHING
+ PostgreSQL commit before manual Kafka offset commit
```

If a worker stops between database commit and offset commit, Kafka may redeliver
the record. The stable `eventId` makes replay idempotent.

## Product Features

- Ontology explorer and React Flow relationship graphs
- Seeded temperature, light, distance, and button simulator
- Virtual LED, servo, buzzer, and relay behind an adapter boundary
- Validated rule CRUD, cooldowns, and deterministic evaluation
- Sensor-to-rule-to-device event timeline and audit trail
- Read-only Explain Why with deterministic evidence and Mastra review
- Gemini Rule Compiler with validated preview and explicit approval
- Ontology-grounded Physical Workspace chat
- Cursor-based SSE and bounded retention cleanup

## Repository Map

```text
app/             Next.js UI and API routes
domain/          ontology, physical-device, and rule vocabulary
lib/             runtime, stores, AI providers, Mastra workflows
db/              SQLite/Drizzle schema and migrations
contracts/       language-neutral JSON Schema contracts
api/             Go Gateway
worker/          NestJS Kafka worker
graph-worker/    Rust projector skeleton
infra/           PostgreSQL, Kafka, MQTT, and Neo4j configuration
compose.yaml     local distributed stack
.fordeploy/      maintainer-operated AWS deployment assets
docs/            plans, state inventory, and implementation handoffs
```

## Running Locally

Run the existing UI with Node.js 22.13+:

```bash
npm install
npm run dev
```

Run the distributed stack with Docker Compose after preparing the ignored local
environment values documented in `.env.example`:

```bash
docker compose --profile graph up -d --build --scale worker=2
```

```bash
curl http://localhost:8080/health
curl http://localhost:8080/ready
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe --group physicalai-telemetry-workers
```

## AWS Deployment

The demo is deployed through a maintainer-operated script. It verifies a clean
checkout, builds four `linux/amd64` application images from a dedicated clean
clone, pulls four infrastructure images locally, and transfers image archives
through a bastion. The private EC2 host runs `docker load` and Compose; language
SDKs and database servers are not installed directly on the host.

```bash
./.fordeploy/deploy.sh
```

Deployment is always manual. Credentials remain in ignored host files and are
not included in images or deployment archives.

## Design Decisions

- Preserve the root Next.js structure; do not relocate it to `frontend/`.
- Use versioned JSON Schema for domain contracts and UTF-8 JSON Kafka payloads.
- Do not add HTTP or gRPC calls between Go and NestJS for telemetry delivery.
- Do not invoke Mastra or an LLM for every telemetry event.
- Keep PostgreSQL authoritative and Neo4j rebuildable.
- Expose only application-controlled SSH sessions, never an OS shell.
- Keep Spring Boot outside this expansion phase.

## Documentation

- [Pre-scaffold inventory](./docs/current-state.md)
- [First implementation handoff](./docs/implementation-1st-plan.md)
- [Distributed expansion plan](./docs/implementation-2nd-plan.md)
- [Scaffolding and vertical slice](./docs/implementation-2nd-001-scaffolding-handoff.md)
- [AWS deployment preparation](./docs/implementation-2nd-002-aws-demo-deployment-preparation.md)
- [Ontology modeling notes](./docs/ontology-modeling-notes.md)

## Stack

Next.js 16 · TypeScript · Tailwind CSS · SQLite · Drizzle ORM · React Flow · Zod ·
Mastra · Google Gemini · Go · Apache Kafka · NestJS · PostgreSQL · MQTT · Rust ·
Neo4j · Docker Compose
