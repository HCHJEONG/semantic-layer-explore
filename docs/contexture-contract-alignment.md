# Contexture Contract Alignment

Date: 2026-08-25

## Purpose

This repository remains the industrial streaming and product-experience runtime.
`contexture-bridge` owns the longer-lived semantic core contracts. The two
repositories should stay separate by default, but share a contract vocabulary so
the factory runtime can contribute to the company semantic layer without being
physically merged into the core repository.

The long-term model is contract-governed federation. A future monorepo remains
possible, but it is not the default target. Many companies do not operate
factories, and manufacturing sites may need their own operational system,
deployment cadence, safety boundaries, and Kafka/MQTT runtime.

## Repository Roles

`semantic-layer-explore` owns:

- MQTT and HTTP ingress;
- Go Gateway validation and Kafka production;
- Kafka topic topology and at-least-once processing;
- NestJS/Mastra worker execution;
- deterministic operational rules;
- PostgreSQL operational state for sensors, devices, commands, events, rules,
  and audits;
- Rust Neo4j rebuild worker for the current projection path; and
- the Next.js physical workspace UI.

`contexture-bridge` owns:

- source-agnostic semantic contracts;
- observation and evidence vocabulary;
- semantic candidate and review decision contracts;
- accepted ontology and semantic layer persistence rules;
- PostgreSQL semantic authority; and
- Neo4j projection semantics.

Future vertical runtimes can follow the same pattern without changing this
repository:

```text
manufacturing runtime  -> factory observations and evidence
document runtime       -> document excerpts, citations, SOP evidence
database runtime       -> schema/profile observations and mappings
finance runtime        -> metrics, ledger controls, business evidence
```

The executive view should consume accepted semantic facts from the shared
semantic layer, not raw Kafka telemetry or site-specific operational internals.

## Boundary Rule

Do not replace high-volume Kafka contracts such as `telemetry.v1` with generic
semantic contracts. The operational path should stay compact and tuned for
factory event processing.

Instead, transform accepted operational facts into Contexture contracts at the
semantic ingestion boundary:

```text
telemetry.v1
  -> contexture.observation.v1
  -> contexture.evidence.v1
  -> contexture.semantic-candidate.v1
  -> contexture.review-decision.v1
  -> contexture.projection-request.v1
```

This lets the factory runtime stay fast while making its facts comparable with
database metadata and document evidence.

Core Contexture names must stay industry-neutral. Factory words such as sensor,
device, PLC, actuator, MQTT, and Kafka belong in `source`, `observedObject`,
payload details, or provenance, not in the generic semantic lifecycle.

## Initial Mapping

### Telemetry

`contracts/telemetry.schema.json` remains the Kafka/MQTT operational payload.

Map to `contexture.observation.v1`:

```text
observationId              derived from telemetry.eventId
source.sourceId            factory, line, cell, or workspace identifier
source.kind                "factory"
source.system              "semantic-layer-explore"
source.adapter             "mqtt-kafka"
observedObject.kind        "sensor"
observedObject.externalId  telemetry.sensorId
observedAt                 telemetry.measuredAt
payload.measurement        telemetry.payload
payload.sequence           telemetry.sequence
provenance.eventId         telemetry.eventId
provenance.correlationId   telemetry.correlationId
provenance.topic           Kafka topic when available
provenance.partition       Kafka partition when available
provenance.offset          Kafka offset when available
```

### Workspace Events And Causal Trace

Persisted `workspace_event` rows and deterministic causal traces can become
`contexture.evidence.v1`.

Use:

```text
evidenceType = "event"
support      = "supports" | "contradicts" | "context" | "unknown"
subject      = sensor, device, rule, command, or semantic relation
claim        = short deterministic statement
details      = bounded structured facts, not raw unlimited logs
```

### Semantic Relations

Current ontology relations are asserted triples. They should map according to
their lifecycle:

```text
suggested relation      -> contexture.semantic-candidate.v1
accepted relation       -> contexture.review-decision.v1 with acceptedSemanticId
graph rebuild trigger   -> contexture.projection-request.v1
```

`semantic.relation.changed` can remain as an internal projection event until the
Contexture projection request path is implemented.

## Contract Source Of Truth

The authoritative copies of Contexture semantic contracts live in:

```text
contexture-bridge/packages/contracts/schemas/
contexture-bridge/packages/contracts/examples/
```

This repository may keep adapter tests, generated TypeScript types, or pinned
copies later, but those should be treated as downstream artifacts.

## Implementation Notes

When implementation begins:

- add a small adapter module instead of changing the telemetry producer;
- validate Contexture payloads at the boundary where they are emitted;
- preserve Kafka topic, partition, offset, event ID, and correlation ID;
- keep semantic ingestion idempotent on `observationId` and `evidenceId`;
- avoid sending raw secret-bearing document text, unrestricted logs, or full
  sensor streams into semantic evidence;
- emit semantic candidates only after deterministic processing or explicit
  Mastra/LLM review labels the output as a proposal; and
- require review decisions before candidates become accepted semantic layer
  facts.

## Federation And Monorepo Readiness

The double-repo structure is healthy as long as:

- this repository changes faster than the semantic core;
- factory safety, Kafka, MQTT, or edge concerns need their own release rhythm;
- other non-manufacturing companies should be able to adopt `contexture-bridge`
  without this industrial runtime; and
- the joining surface remains contract examples, schema validation, and adapter
  tests.

A future monorepo, if it ever becomes simpler, should preserve this boundary:

```text
packages/contracts      Contexture-owned shared schemas
packages/ontology       Contexture-owned semantic vocabulary
services/context-api    semantic authority and projection orchestration
services/ingestion-api  Go or Nest ingress boundary if retained
services/mastra-worker  workflow and agent execution
infra/kafka             streaming runtime
infra/postgres          authoritative stores
infra/neo4j             rebuildable projections
```

Until then, the double-repo integration surface is contract examples, schema
validation, compatibility tests, and explicit adapter tests.
