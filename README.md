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
- SQLite schema containing only `classes`, `properties`, `individuals`, and `relations`
- Read and create REST endpoints with Zod validation
- Gemini tool-calling agent with an enforced ontology-first flow
- Temporary per-process Ask AI protection: 10 requests per visitor and UTC day
- File-backed SQLite with automatic Drizzle migrations, WAL mode, and persistent-volume support
- Health and readiness endpoints for local and AWS operation
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

## Local development

Requirements: Node.js 22.13+ and Google Cloud Application Default Credentials compatible with the existing `lawvot` setup.

```bash
npm install
npm run dev
```

Gemini follows the same environment convention as `lawvot`:

```dotenv
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=global
GEMINI_MODEL=gemini-3.5-flash-lite
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
DATABASE_PATH=./data/ai-workspace.sqlite
```

The Gemini model has one configuration source: `GEMINI_MODEL`, with `gemini-3.5-flash-lite` as the default. This mirrors the current `sampoongaptcom` Vertex AI setup and avoids stale model fallbacks.

## Project philosophy

This is not a Protégé clone. It intentionally does not implement OWL, RDF, SPARQL, reasoning, ontology import/export, permissions, or a graph database. Its purpose is educational: make the flow **Semantic Layer → API → Gemini → UI** visible, inspectable, and easy to discuss in an interview.

## Future work

OWL import, RDF export, reasoners, Neo4j/GraphDB, Palantir-style ontology modeling, an MCP server, enterprise semantic layers, natural-language workflows, and role-based actions are intentionally left as future directions—not hidden scope.

## Stack

Next.js 16 standalone · TypeScript · Tailwind CSS · shadcn-style UI primitives · SQLite · Drizzle ORM · React Flow · Zod · Google Gemini
