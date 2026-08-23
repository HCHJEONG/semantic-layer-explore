# Second-Stage Handoff 009: PostgreSQL Ontology Authority

Date: 2026-08-23

## Implemented

- PostgreSQL `semantic_classes`, `semantic_properties`, `semantic_individuals`, and `semantic_relations` are the default ontology source.
- Go exposes read/create endpoints under `/semantic/*` while preserving the original Next.js DTO fields.
- Every semantic mutation and its `semantic.graph.rebuild` outbox row commit in one PostgreSQL transaction.
- The Go outbox relay publishes rebuild events to Kafka and marks rows only after a successful publish. Redelivery remains possible and is handled by the rebuildable projection.
- Next.js ontology routes are thin BFF handlers for Go by default.
- `ONTOLOGY_BACKEND=sqlite` retains the existing SQLite ontology as an explicit legacy standalone mode, including relation creation.
- The existing Ask AI and Rule Proposal ontology-first tool ordering remains unchanged and is covered by regression assertions.
- Rust consumes the emitted rebuild events and replaces the Neo4j projection from PostgreSQL.

## Verified

- `go test ./...`
- `npm test` after adding the explicit SQLite legacy test mode
- `docker compose config --quiet`
- `docker compose --profile graph up -d --build`
- Next BFF E2E creation of one Class, one Property, two Individuals, and one Relation
- PostgreSQL outbox: 5 rows created, 5 rows marked published
- Final graph projection: `ready`, 34 nodes, 15 relations
- Neo4j query: 34 `SemanticEntity` nodes, 15 `SEMANTIC_RELATION` edges

The E2E data was created only in the disposable local Compose volume.

## Resulting Ownership

- PostgreSQL: authoritative ontology store
- Neo4j: rebuildable semantic projection
- SQLite: legacy standalone candidate, selected only with `ONTOLOGY_BACKEND=sqlite`
- Next.js: UI and thin ontology BFF
- Go: ontology command/query API and outbox relay
- Rust: Neo4j projection consumer

## Next Scope

1. Migrate `rules`, `sensors`, and `devices` to PostgreSQL-backed worker/gateway ownership while preserving Next.js DTOs.
2. Finally migrate `events` and the Explain causal trace.
