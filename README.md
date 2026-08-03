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
- Per-visitor Ask AI protection: 10 requests per UTC day at the edge
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

## Local development

Requirements: Node.js 22.13+ and Google Cloud Application Default Credentials compatible with the existing `lawvot` setup.

```bash
npm install
npm run dev
```

Gemini follows the same environment convention as `lawvot`:

```dotenv
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GEMINI_MODEL_ID=gemini-2.0-flash
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
# Optional for edge deployments: GOOGLE_API_KEY=your-gemini-api-key
```

Model resolution order is `AI_MODEL_ID` → `VERTEX_AI_MODEL_ID` → `GEMINI_MODEL_ID` → `gemini-2.0-flash`.

## Project philosophy

This is not a Protégé clone. It intentionally does not implement OWL, RDF, SPARQL, reasoning, ontology import/export, permissions, or a graph database. Its purpose is educational: make the flow **Semantic Layer → API → Gemini → UI** visible, inspectable, and easy to discuss in an interview.

## Future work

OWL import, RDF export, reasoners, Neo4j/GraphDB, Palantir-style ontology modeling, an MCP server, enterprise semantic layers, natural-language workflows, and role-based actions are intentionally left as future directions—not hidden scope.

## Stack

Next.js 16 · TypeScript · Tailwind CSS · shadcn-style UI primitives · SQLite/D1 · Drizzle ORM · React Flow · Zod · Google Gemini
