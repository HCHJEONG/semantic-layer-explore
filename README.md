# BestAiCom Semantic Workspace

[한국어 README 보기](./READMEKor.md)

> A Minimal Ontology → Database → API → AI Demo

BestAiCom Semantic Workspace is a deliberately small portfolio project that demonstrates how shared business meaning can sit between an LLM, REST APIs, and operational data. It borrows only three approachable ideas from Protégé—**Class**, **Property**, and **Individual**—and keeps the implementation compact enough to understand in one sitting.

## Why

An LLM does not inherently understand what a table, ERP field, or CRM relationship means to a business. Database schemas describe storage; they do not reliably communicate business semantics.

A semantic layer provides that missing contract. It tells an AI that `InspectionTeam` is a `Person`, that `assignedTo` connects an operator to a workspace project, and that `BestAiCom` is a concrete `Company`. This project implements the smallest useful version of that idea.

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
- Keep rule evaluation pure, while runtime orchestration handles persistence, events, and device commands.
- Force ontology-first AI tool calling in code, not only in prompts, and expose AI tools through REST APIs rather than direct database or hardware access.
- Let AI propose automation, but keep approval and mutation as separate human-controlled actions.

For the full retrospective handoff plan, see [`implementation-plan.md`](./implementation-plan.md).

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
| `POST` | `/api/ask` | Ask Gemini an ontology-aware question |
| `GET` | `/api/health` | Lightweight process health check |
| `GET` | `/api/ready` | Database and runtime readiness check |
| `GET` | `/api/state` | Current simulated workspace snapshot |
| `GET` | `/api/sensors` | Sensors with latest readings |
| `GET` | `/api/devices` | Virtual device states |
| `POST` | `/api/devices/:id/commands` | Execute a validated virtual-device command |
| `GET` | `/api/events` | Read the physical workspace event timeline |
| `GET`, `POST` | `/api/rules` | List or create validated automation rules |
| `GET`, `PATCH`, `DELETE` | `/api/rules/:id` | Read, update, or delete a rule |
| `POST` | `/api/rules/:id/enable` | Enable a rule |
| `POST` | `/api/rules/:id/disable` | Disable a rule |
| `GET`, `POST` | `/api/simulator/*` | Inspect and control the simulator |
| `POST` | `/api/ai/rules/propose` | Propose—but never save—a validated rule with Gemini |
| `POST` | `/api/ai/chat` | Explain workspace state and events through ontology-first tools |

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
READING_RETENTION_DAYS=1
AUDIT_EVENT_RETENTION_DAYS=30
RETENTION_CLEANUP_INTERVAL_MS=3600000
RETENTION_BATCH_SIZE=5000
```

The Google Cloud project is read from the service account JSON's `project_id`; `GOOGLE_CLOUD_PROJECT` remains an optional override. The Gemini model has one configuration source: `GEMINI_MODEL`, with `gemini-3.5-flash-lite` as the default.

The runtime retains high-volume sensor readings and matching `sensor.reading` events for 7 days, while lower-volume audit events are retained for 30 days. Cleanup runs at startup and hourly in bounded batches so it does not monopolize SQLite. Deleted pages are reused by SQLite; the scheduler intentionally does not run `VACUUM`, which could block live traffic. Rule evaluation is serialized and keeps at most the newest pending reading per sensor, preventing an unbounded async backlog when device execution is slow.

## AWS deployment shape

This repository intentionally keeps a source-archive-based AWS deployment example in `.fordeploy/deploy.sh`. Unlike sibling projects such as `global-ai-pricing` and `legacy-lang-intelligence`, this script does not build a Docker image locally and ship an image tar to AWS. Instead, it packages the source tree, sends that source archive through the Bastion host, and builds the Docker image on the private EC2 instance.

```text
local machine
  -> create ai-workspace-source.xxxxxx.tar.gz
  -> scp source archive to Bastion EC2
  -> Bastion scp source archive to private EC2
  -> private EC2 extracts the source into a temporary build directory
  -> private EC2 runs docker build
  -> private EC2 replaces the ai-physical-workspace container
```

The source archive excludes `.git`, `node_modules`, `.next`, and `data`, so the upload is small and the persistent SQLite volume is not replaced by deployment. The Docker build, including `npm run build`, happens on the private EC2 instance. This is intentionally different from the local-build/image-tar pattern and is kept as a reference deployment style for future projects where a remote build example is useful.

## Project philosophy

This is not a Protégé clone. It intentionally does not implement OWL, RDF, SPARQL, reasoning, ontology import/export, permissions, or a graph database. Its purpose is educational: make the flow **Semantic Layer → API → Gemini → UI** visible, inspectable, and easy to discuss in an interview.

## Future work

OWL import, RDF export, reasoners, Neo4j/GraphDB, Palantir-style ontology modeling, an MCP server, enterprise semantic layers, natural-language workflows, and role-based actions are intentionally left as future directions—not hidden scope.

## Stack

Next.js 16 standalone · TypeScript · Tailwind CSS · shadcn-style UI primitives · SQLite · Drizzle ORM · React Flow · Zod · Google Gemini
