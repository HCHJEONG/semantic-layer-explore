# Implementation 2nd 008 Rust Neo4j Projection Handoff

Date: 2026-08-23

## Scope

This step implemented the first complete `semantic.graph.rebuild` projection
flow from PostgreSQL through Kafka and the Rust graph worker into Neo4j. It also
added restricted Go read APIs and a compact Next.js operations view.

No AWS deployment was performed by the agent.

## SQLite Compatibility

The PostgreSQL semantic source tables intentionally preserve the existing
SQLite semantic model:

- `semantic_classes`: `id`, `name`, `description`
- `semantic_properties`: `id`, `name`, `domain_class_id`, `range_class_id`, `description`
- `semantic_individuals`: `id`, `name`, `class_id`, `description`, `external_id`
- `semantic_relations`: `id`, `subject_id`, `property_id`, `object_id`

Migration `003_semantic_graph_projection.sql` seeds all current SQLite baseline
classes, properties, individuals, and relations. The existing SQLite runtime
and ontology explorer remain operational and unchanged.

Neo4j IDs are namespaced as `Class:N`, `Property:N`, and `Individual:N` because
SQLite/PostgreSQL IDs are unique only within each table.

## Implemented Flow

```text
POST /graph/projection/rebuild
  -> Go publishes graph-rebuild.v1
  -> Kafka semantic.graph.rebuild
  -> Rust validates and consumes with manual offset commit
  -> Rust reads PostgreSQL semantic_* source tables
  -> one Neo4j transaction replaces the SemanticEntity projection
  -> Rust records projection status in PostgreSQL
  -> Go exposes restricted status and ontology DTOs
  -> Next.js BFF and dashboard display projection evidence
```

The Kafka offset is committed only after Neo4j projection and PostgreSQL status
persistence succeed. This is at-least-once processing, not exactly-once.

## APIs And UI

- `POST /graph/projection/rebuild`
- `GET /graph/projection/status`
- `GET /graph/ontology`
- Next.js thin BFF routes under `/api/graph/**`
- `RUST GRAPH WORKER / Neo4j Projection` dashboard panel with status, counts,
  representative individuals, and an explicit rebuild command

Next.js does not connect to Neo4j directly. Go uses fixed, bounded Cypher
queries and does not expose a general Cypher proxy.

## Verification

Commands run included:

```sh
npm run build
docker run --rm -v /home/hchjeong/IntelliJProjects/semantic-layer-explore/api:/src -w /src golang:1.22-bookworm /bin/sh -c '/usr/local/go/bin/gofmt -w ... && /usr/local/go/bin/go test ./...'
POSTGRES_PASSWORD=physicalai NEO4J_PASSWORD=physicalai docker compose --profile graph build graph-worker api
POSTGRES_PASSWORD=physicalai NEO4J_PASSWORD=physicalai docker compose --profile graph up -d --build
curl -X POST http://127.0.0.1:8080/graph/projection/rebuild
curl http://127.0.0.1:8080/graph/projection/status
curl http://127.0.0.1:8080/graph/ontology
curl http://127.0.0.1:3000/api/graph/projection/status
curl http://127.0.0.1:3000/api/graph/ontology
docker compose exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka:9092 --describe --group physicalai-graph-projectors
```

Observed local results:

- PostgreSQL source: 8 classes, 7 properties, 15 individuals, 14 relations.
- Neo4j projection: 30 nodes and 14 relations.
- Go and Next.js returned the same namespaced graph DTO.
- Projection status reached `ready`.
- `physicalai-graph-projectors` lag returned to `0`.
- A graph worker startup race was fixed by waiting for `kafka-init` completion.

## Deferred

- `semantic.relation.changed` incremental projection
- transactional outbox relay for semantic mutations
- user-facing impact traversal beyond the compact operations status panel
- migration of live SQLite ontology mutations into PostgreSQL authority
