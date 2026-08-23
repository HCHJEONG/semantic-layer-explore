# BestAiCom Semantic Workspace

[한국어 README 보기](./READMEKor.md)

> A Minimal Ontology → Database → API → AI Demo

BestAiCom Semantic Workspace is a deliberately small portfolio project that demonstrates how shared business meaning can sit between an LLM, REST APIs, and operational data. It borrows only three approachable ideas from Protégé—**Class**, **Property**, and **Individual**—and keeps the implementation compact enough to understand in one sitting.

## Why

An LLM does not inherently understand what a table, ERP field, or CRM relationship means to a business. Database schemas describe storage; they do not reliably communicate business semantics.

A semantic layer provides that missing contract. It tells an AI that `InspectionTeam` is a `Person`, that `assignedTo` connects an operator to a workspace project, and that `BestAiCom` is a concrete `Company`. This project implements the smallest useful version of that idea.

## Distributed Physical AI expansion

The working Next.js and SQLite application is being extended into a polyglot
distributed system designed for high-volume telemetry. The existing UI and
domain baseline remain at the repository root while ingress, transport,
processing, operational storage, and semantic projection gain independent
service boundaries.

```text
HTTP telemetry
  -> Go Gateway
  -> Kafka telemetry.raw (6 partitions)
  -> NestJS worker x N (one consumer group)
  -> PostgreSQL authoritative operational store
```

The target device and graph paths extend this flow with
`MQTT -> Go -> Kafka -> worker x N -> PostgreSQL` and
`Kafka -> Rust graph worker -> Neo4j`.

This is an expansion model for increasing data volume:

- Go Gateway instances can scale the ingress boundary independently.
- Kafka partitions distribute device streams while preserving order per device
  key.
- The same worker image scales horizontally, with Kafka assigning partitions
  across consumer-group members.
- PostgreSQL remains the operational source of truth and scales separately from
  application containers.
- Neo4j is a rebuildable read model, isolating graph traversal from authoritative
  writes.
- Kafka carries asynchronous events, while synchronous queries, sessions, and
  light commands use Go HTTP/WebSocket/SSE boundaries.

The verified AWS slice is
`HTTP -> Go -> Kafka -> NestJS worker x 2 -> PostgreSQL`: a smoke event was
persisted with its Kafka topic, partition, and offset, and consumer lag returned
to zero. Processing uses at-least-once delivery, `eventId` idempotency, and manual
offset commit after PostgreSQL persistence; it does not claim exactly-once.

With the graph profile and two workers, Compose creates 11 containers from eight
unique images. Two initialization containers exit after success, leaving nine
long-running services.

| Distributed area | Current state |
| --- | --- |
| Go HTTP ingestion and Kafka producer | Implemented and verified |
| NestJS consumer group and PostgreSQL persistence | Implemented and verified |
| Two-worker partition distribution | Implemented and verified |
| Mosquitto broker | Deployed internally |
| Go MQTT subscriber | Skeleton only |
| Neo4j service | Deployed and startup verified |
| Rust Kafka consumer and Neo4j projection | Rebuild flow implemented and locally verified |
| Go graph queries and Next.js graph status | Minimal read/status flow implemented and locally verified |

The verified slice does not imply that MQTT ingestion or Neo4j projection is
complete. See the [distributed expansion plan](./docs/implementation-2nd-plan.md)
and [scaffolding handoff](./docs/implementation-2nd-001-scaffolding-handoff.md)
for the detailed boundaries.

## Reading The System As One Story

The stack becomes easier to understand when each technology is treated as one
role in a single system rather than as a separate subject to memorize.

| Technology | Why it is here |
| --- | --- |
| **Next.js / React** | Gives people a place to inspect state and issue commands. |
| **TypeScript** | Keeps the UI and AI application logic type-safe. |
| **Go Gateway** | Accepts external input and routes it into internal services. |
| **HTTP/REST** | Provides synchronous request-response boundaries between programs. |
| **MQTT / Mosquitto** | Gives constrained devices a lightweight telemetry pub/sub channel. |
| **Kafka** | Buffers events and distributes partitioned work to independent consumers. |
| **NestJS worker** | Polls Kafka and performs validation and operational processing. |
| **PostgreSQL** | Persists distributed operational records that must not be lost. |
| **SQLite** | Keeps the original single-application semantic/runtime demo self-contained. |
| **Neo4j** | Projects and traverses complex relationships as a graph read model. |
| **Ontology / Semantic Layer** | Defines the vocabulary shared by the system and AI. |
| **Gemini / LLM** | Understands language and generates tool choices, explanations, or proposals. |
| **Mastra** | Organizes multi-step AI review as an explicit workflow. |
| **Zod / JSON Schema** | Validate external data at runtime and across language boundaries. |
| **Drizzle** | Maps TypeScript application data to the SQLite baseline. |
| **Docker / Compose** | Fixes each runtime environment and starts the services as one system. |
| **AWS EC2** | Runs the composed system continuously outside a developer machine. |

A compact mental model is:

```text
React shows
APIs receive and answer
MQTT receives from devices
Kafka buffers and distributes
workers process
PostgreSQL remembers operational truth
Neo4j explores relationships
the ontology defines meaning
the LLM communicates through that meaning
Docker packages the parts
```

### Two Different Traffic Paths

Not every request should pass through Kafka. A synchronous query asks for an
answer now:

```text
Browser -> API -> data store -> API -> Browser
```

Kafka belongs in the asynchronous event path, where producers should not wait
for all downstream work to finish:

```text
Device -> MQTT -> Go -> Kafka -> worker -> PostgreSQL
```

The first path means, "return the current answer." The second means, "something
happened; process it reliably." Treating Kafka as a general RPC mechanism would
mix those concerns and make simple queries unnecessarily slow and complex.

The current Next.js dashboard still reads its established SQLite runtime through
Next.js API routes. The planned distributed query boundary is
`Browser -> Next.js thin BFF -> Go -> PostgreSQL/Neo4j`; it is not yet a completed
replacement for every existing SQLite route.

### Following One Telemetry Event

Imagine a factory temperature sensor reporting `37.8 C`.

1. **Device ingress.** In the target path, the device publishes a versioned
   telemetry envelope to a topic such as `devices/TEMP-001/telemetry`. Mosquitto
   provides the MQTT broker. The broker is deployed, but the Go MQTT subscriber
   is still a skeleton; AWS verification currently begins at Go's HTTP endpoint.
2. **Gateway validation.** Go checks the telemetry envelope and publishes the
   accepted event to `telemetry.raw`. It does not wait for a worker to finish or
   write the raw event directly to PostgreSQL.
3. **Durable distribution.** Kafka retains the record in one of six partitions.
   The device ID is the record key, so events from the same device are routed
   consistently for ordered processing within a partition.
4. **Consumer-group processing.** Each NestJS worker continuously polls Kafka as
   a member of `physicalai-telemetry-workers`. Kafka divides partitions among
   the active workers. Go neither knows nor needs to know whether there are two,
   three, or more consumers.
5. **Operational persistence.** The worker validates the event and stores it in
   PostgreSQL with its Kafka topic, partition, and offset. A unique `eventId`
   makes redelivery safe. Deterministic rule migration and conditional Mastra
   execution are later worker stages, not completed claims of this slice.
6. **Read-side use.** Synchronous APIs can later query authoritative operational
   state directly. Semantic relationship events can independently feed the Rust
   projector and Neo4j without putting Neo4j on the high-volume telemetry write
   path.

Kafka and PostgreSQL answer different questions:

```text
Kafka:      What happened, and what remains to be processed?
PostgreSQL: What operational facts were accepted and persisted?
```

### Where AI Fits

AI is beside the deterministic system, not in place of it. For a question such
as "Why did the buzzer activate?", the application first reconstructs recorded
sensor, rule, and command evidence. The ontology tells the AI what those entities
and relationships mean; tools expose only the required APIs; Mastra structures
the review; and the LLM turns the evidence into a human-readable explanation.

```text
User question
  -> ontology-guided tool selection
  -> event / rule / state evidence
  -> deterministic causal trace
  -> optional Mastra/LLM review
  -> explanation
```

The LLM does not execute approved rules, replace event persistence, or invent a
cause when provenance is missing. It adds natural-language understanding,
proposal, and explanation capabilities on top of auditable application logic.

The whole system can therefore be summarized in one sentence:

> Human or device input enters through APIs or MQTT; Kafka buffers and
> distributes high-volume events; workers apply operational logic; PostgreSQL
> remembers authoritative results; the semantic layer defines what the data
> means; and AI uses that meaning and controlled tools to connect the system back
> to people.

## Architecture

```text
Browser
   ↓
Next.js UI
   ↓
Gemini (tool calling)
   ↓
Semantic Layer API (/api/ontology)
   ↓
Entity REST APIs
   ↓
SQLite (Drizzle ORM)
```

Gemini never accesses SQLite. Every question begins with `getOntology()`. After understanding the available classes, properties, and relationships, Gemini requests only the REST resources it needs.

The Physical AI extension keeps the same boundary and adds a deterministic runtime below the API:

```text
Simulator Sensor → Sensor Event → Rule Engine → Virtual Device
                                      ↓
                               Auditable Event Log
```

The rule engine—not Gemini—evaluates approved rules and executes device commands. The simulator implements the same adapter boundary reserved for a future MQTT/Arduino connection.

The Workspace Dashboard also includes a minimal **Explain Why** flow for explainable action events. When a device command appears in the Event Timeline, the user can jump to Ask AI Explain Mode. The backend reconstructs the application-level causal trace from recorded events first, then runs a small Mastra workflow that reviews sensor, rule, and execution evidence before producing the structured explanation. This is read-only: it does not issue commands, change rules, or infer why the physical world produced a sensor reading.

The LLM integration is being prepared behind a provider boundary. `lib/ai/llm/provider.ts` defines the model-agnostic interface, while `lib/ai/llm/gemini-provider.ts` adapts the existing Vertex Gemini client. This keeps the current Gemini 3.5 Flash Lite setup replaceable by a later provider without changing Mastra workflow code.

The demo keeps deployment simple by using one SQLite file, but the schema separates the semantic metadata store from operational state. Ontology records live in `semantic_classes`, `semantic_properties`, `semantic_individuals`, and `semantic_relations`; runtime state lives in `sensors`, `devices`, `sensor_readings`, `events`, and `rules`.

```text
"Which project is the operations engineer assigned to?"
  → getOntology()
  → recognizes Person —worksFor→ Company
  → getIndividuals()
  → getRelations()
  → "OpsEngineer is assigned to BestAiCom Smart Workspace."
```

## Implementation planning note

For a project like this, it is more natural to define the domain model before designing the database schema. The database is the persistence layer for the concepts; it should not be the first place where the concepts are invented.

The development sequence can be planned as:

1. Start with `domain/physical.ts`.
   Define what a sensor is, what a device is, and the minimum shared contract for readings and commands.
2. Then define `domain/rule.ts`.
   Decide which readings can be evaluated as conditions, and which device actions can be executed.
3. Then define `domain/ontology.ts`.
   Describe the system at the semantic layer: classes, properties, individuals, and relations.
4. Finally, design `db/schema.ts`.
   Map those domain concepts into persistent tables.

This keeps the implementation plan centered on the system's vocabulary and behavior first, then turns that model into storage, runtime orchestration, APIs, and AI tools.

The same plan also preserves a few reusable architecture patterns:

- Keep physical I/O, database access, and LLM provider calls behind replaceable adapter or provider boundaries.
- Validate external input at runtime boundaries, and infer TypeScript types from the same schemas where useful.
- Use a current state snapshot for fast UI rendering, plus an auditable event history for explanation and debugging.
- Stream live operational updates with cursor-based SSE and heartbeats instead of requiring WebSockets.
- The current event stream is a deliberate demo compromise: simulator readings are pushed into the runtime by callback and persisted immediately, while SSE clients receive events through server-side polling of the event store. This keeps cursor replay and reconnect behavior simple; a future runtime event bus could publish newly persisted events directly when sub-second realtime delivery matters.
- Keep rule evaluation pure, while runtime orchestration handles persistence, events, and device commands.
- Force ontology-first AI tool calling in code, not only in prompts, and expose AI tools through REST APIs rather than direct database or hardware access.
- Let AI propose automation, but keep approval and mutation as separate human-controlled actions.

For the ontology terminology decisions that guide the `domain/` model, see [`docs/ontology-modeling-notes.md`](./docs/ontology-modeling-notes.md).

For the retrospective implementation handoff plan that builds on the completed domain model, see [`docs/implementation-1st-plan.md`](./docs/implementation-1st-plan.md). A separate follow-on distributed Physical AI expansion plan lives in [`docs/implementation-2nd-plan.md`](./docs/implementation-2nd-plan.md).

## Features

- Three-column ontology explorer with details and live JSON
- Relationship graph powered by React Flow
- Namespaced semantic metadata tables, plus isolated physical workspace tables for sensors, devices, readings, rules, and events
- Read and create REST endpoints with Zod validation
- Gemini tool-calling agent with an enforced ontology-first flow
- Temporary per-process Ask AI protection: 10 requests per visitor and UTC day
- File-backed SQLite with automatic Drizzle migrations, WAL mode, and persistent-volume support
- Health and readiness endpoints for local and AWS operation
- Seeded Sensor simulator for temperature, light, distance, and button readings
- Virtual LED, Servo, Buzzer, and Relay devices behind a hardware-neutral adapter
- Persistent Sensor/Event audit trail and deterministic demo scenarios
- Bounded latest-state rule evaluation, cached active rules, and batched data retention cleanup
- Validated Rule CRUD, deterministic operator evaluation, and per-rule cooldown
- Sensor Event → Rule match → Virtual Device execution with auditable outcomes
- Polling-based workspace dashboard with live sensor cards, device controls, deterministic demo scenarios, and an event timeline
- Explain Why for eligible device-command events, with deterministic causal traces and partial explanations when provenance is missing
- Gemini Rule Compiler with ontology/sensor/device tool calls, validated JSON preview, and an explicit human approval gate
- Physical Workspace Chat grounded in current state, approved rules, and recent events
- Extended physical ontology showing `Sensor → Event → Rule → Device`, with runtime IDs bound to semantic Individuals
- Data-driven React Flow layout for both the original business demo and Physical Workspace relationships
- Responsive, portfolio-ready interface

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET`, `POST` | `/api/classes` | List or create classes |
| `GET`, `POST` | `/api/properties` | List or create properties |
| `GET`, `POST` | `/api/individuals` | List or create individuals |
| `GET` | `/api/relations` | List resolved relationships |
| `GET` | `/api/ontology` | Return the complete semantic layer |
| `GET` | `/api/health` | Lightweight process health check |
| `GET` | `/api/ready` | Database and runtime readiness check |
| `GET` | `/api/state` | Current simulated workspace snapshot |
| `GET` | `/api/sensors` | Sensors with latest readings |
| `GET` | `/api/devices` | Virtual device states |
| `POST` | `/api/devices/:id/commands` | Execute a validated virtual-device command |
| `GET` | `/api/events` | Read the physical workspace event timeline |
| `GET` | `/api/events/stream` | Stream the physical workspace event timeline |
| `GET`, `POST` | `/api/rules` | List or create validated automation rules |
| `GET`, `PATCH`, `DELETE` | `/api/rules/:id` | Read, update, or delete a rule |
| `POST` | `/api/rules/:id/enable` | Enable a rule |
| `POST` | `/api/rules/:id/disable` | Disable a rule |
| `GET`, `POST` | `/api/simulator/*` | Inspect and control the simulator |
| `POST` | `/api/ai/rules/propose` | Propose—but never save—a validated rule with Gemini |
| `POST` | `/api/ai/chat` | Explain workspace state and events through ontology-first tools |
| `POST` | `/api/ai/explain-event` | Build a read-only causal trace for one explainable event |

## Local development

Requirements: Node.js 22.13+ and Google Cloud Application Default Credentials compatible with the existing `lawvot` setup.

```bash
npm install
npm run dev
```

Gemini follows the same environment convention as `lawvot`:

```dotenv
GOOGLE_CLOUD_LOCATION=global
GEMINI_MODEL=gemini-3.5-flash-lite
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
DATABASE_PATH=./data/ai-workspace.sqlite
DB_PROVIDER=sqlite
ONTOLOGY_BACKEND=sqlite
OPERATIONAL_BACKEND=sqlite
EXPLAIN_LLM_REVIEW=disabled
READING_RETENTION_DAYS=1
AUDIT_EVENT_RETENTION_DAYS=30
RETENTION_CLEANUP_INTERVAL_MS=3600000
RETENTION_BATCH_SIZE=5000
```

The Google Cloud project is read from the service account JSON's `project_id`; `GOOGLE_CLOUD_PROJECT` remains an optional override. The Gemini model has one configuration source: `GEMINI_MODEL`, with `gemini-3.5-flash-lite` as the default.

In the distributed Compose runtime, PostgreSQL is authoritative for ontology, rules, sensors, and virtual device state, while the corresponding Next.js routes proxy the Go Gateway. `ONTOLOGY_BACKEND=sqlite` and `OPERATIONAL_BACKEND=sqlite` select the legacy standalone Next.js stores used by regression tests. `DB_PROVIDER` still controls the remaining Next.js event and explainability store. `EXPLAIN_LLM_REVIEW=enabled` opts the Mastra evidence review steps into live LLM review through the app-level LLM adapter.

The runtime retains high-volume sensor readings and matching `sensor.reading` events for 7 days, while lower-volume audit events are retained for 30 days. Cleanup runs at startup and hourly in bounded batches so it does not monopolize SQLite. Deleted pages are reused by SQLite; the scheduler intentionally does not run `VACUUM`, which could block live traffic. Rule evaluation is serialized and keeps at most the newest pending reading per sensor, preventing an unbounded async backlog when device execution is slow.

## AWS deployment shape

The current `.fordeploy/deploy.sh` uses a verified clean clone to build four
`linux/amd64` application images locally, pulls four infrastructure images
locally, and transfers the eight unique images through the Bastion host. The
private EC2 instance performs `docker load` and Compose startup rather than
installing language SDKs or building the services. Deployment is always run
manually by the maintainer.

The repository previously used the following source-archive deployment shape.
It is retained here as historical design context; it is no longer the active
path:

```text
local machine
  -> create ai-workspace-source.xxxxxx.tar.gz
  -> scp source archive to Bastion EC2
  -> Bastion scp source archive to private EC2
  -> private EC2 extracts the source into a temporary build directory
  -> private EC2 runs docker build
  -> private EC2 replaces the ai-physical-workspace container
```

In that previous model, the source archive excluded `.git`, `node_modules`,
`.next`, and `data`, so the persistent SQLite volume was not replaced by
deployment. The Docker build, including `npm run build`, happened on the private
EC2 instance. The inactive legacy block remains in the script as a reference,
while the active path uses locally built image archives.

## Project philosophy

This is not a Protégé clone. It intentionally does not implement OWL, RDF,
SPARQL, reasoning, ontology import/export, or permissions. Neo4j is being added
only as a rebuildable semantic read model, not as a general ontology editor or
source of truth. The educational purpose remains to make **Semantic Layer → API
→ Gemini → UI**, and now the distributed telemetry path, visible and inspectable.

## Future work

OWL import, RDF export, reasoners, richer Neo4j projection queries,
Palantir-style ontology modeling, an MCP server, enterprise semantic layers,
natural-language workflows, and role-based actions remain explicit future
directions rather than hidden scope.

## Stack

Next.js 16 standalone · TypeScript · Tailwind CSS · shadcn-style UI primitives · SQLite · Drizzle ORM · React Flow · Zod · Mastra · Google Gemini · Go · Apache Kafka · NestJS · PostgreSQL · MQTT · Rust · Neo4j · Docker Compose
