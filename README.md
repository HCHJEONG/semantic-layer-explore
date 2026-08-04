# Semantic Layer Explorer

> A Minimal Ontology → Database → API → AI Demo

Semantic Layer Explorer is a deliberately small portfolio project that demonstrates how shared business meaning can sit between an LLM, REST APIs, and operational data. It borrows only three approachable ideas from Protégé—**Class**, **Property**, and **Individual**—and keeps the implementation compact enough to understand in one sitting.

## Why

An LLM does not inherently understand what a table, ERP field, or CRM relationship means to a business. Database schemas describe storage; they do not reliably communicate business semantics.

A semantic layer provides that missing contract. It tells an AI that `Alice` is a `Person`, that `worksFor` connects a `Person` to a `Company`, and that `OpenAI` is a concrete `Company`. This project implements the smallest useful version of that idea.

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

```text
"Where does Alice work?"
  → getOntology()
  → recognizes Person —worksFor→ Company
  → getIndividuals()
  → getRelations()
  → "Alice works for OpenAI."
```

## Features

- Three-column ontology explorer with details and live JSON
- Relationship graph powered by React Flow
- Original four-table ontology model, plus isolated physical workspace tables for sensors, devices, readings, rules, and events
- Read and create REST endpoints with Zod validation
- Gemini tool-calling agent with an enforced ontology-first flow
- Temporary per-process Ask AI protection: 10 requests per visitor and UTC day
- File-backed SQLite with automatic Drizzle migrations, WAL mode, and persistent-volume support
- Health and readiness endpoints for local and AWS operation
- Seeded Sensor simulator for temperature, light, distance, and button readings
- Virtual LED, Servo, Buzzer, and Relay devices behind a hardware-neutral adapter
- Persistent Sensor/Event audit trail and deterministic demo scenarios
- Validated Rule CRUD, deterministic operator evaluation, and per-rule cooldown
- Sensor Event → Rule match → Virtual Device execution with auditable outcomes
- Polling-based workspace dashboard with live sensor cards, device controls, deterministic demo scenarios, and an event timeline
- Gemini Rule Compiler with ontology/sensor/device tool calls, validated JSON preview, and an explicit human approval gate
- Physical Workspace Chat grounded in current state, approved rules, and recent events
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
```

The Google Cloud project is read from the service account JSON's `project_id`; `GOOGLE_CLOUD_PROJECT` remains an optional override. The Gemini model has one configuration source: `GEMINI_MODEL`, with `gemini-3.5-flash-lite` as the default.

## Project philosophy

This is not a Protégé clone. It intentionally does not implement OWL, RDF, SPARQL, reasoning, ontology import/export, permissions, or a graph database. Its purpose is educational: make the flow **Semantic Layer → API → Gemini → UI** visible, inspectable, and easy to discuss in an interview.

## Future work

OWL import, RDF export, reasoners, Neo4j/GraphDB, Palantir-style ontology modeling, an MCP server, enterprise semantic layers, natural-language workflows, and role-based actions are intentionally left as future directions—not hidden scope.

## Stack

Next.js 16 standalone · TypeScript · Tailwind CSS · shadcn-style UI primitives · SQLite · Drizzle ORM · React Flow · Zod · Google Gemini
