# Semantic Layer Explore Agent Instructions

## Required Reading

Before making substantial changes, read the documents relevant to the active
implementation stage:

1. `README.md`
2. `docs/implementation-1st-plan.md`
3. `docs/implementation-2nd-plan.md`
4. `docs/ontology-modeling-notes.md`
5. `docs/current-state-before-2nd-plan.md`
6. `docs/contexture-contract-alignment.md`
7. The latest numbered `docs/implementation-2nd-*-handoff.md`

Treat the implementation plans as architecture constraints, and handoff files
as records of what was actually implemented and verified. Do not describe a
planned or placeholder component as completed.

## Current Architecture

This repository is a polyglot distributed monorepo built around an existing
root-level Next.js application.

- Keep the existing Next.js application at the repository root. Do not move it
  into `frontend/`.
- `api/` is the Go protocol gateway.
- `worker/` is one scalable NestJS/Mastra Kafka worker service and image.
- `graph-worker/` is the Rust Neo4j projection worker.
- `contracts/` contains language-neutral JSON Schema contracts.
- `infra/` contains PostgreSQL, Kafka, Mosquitto, and Neo4j configuration.
- PostgreSQL is the authoritative operational store.
- Neo4j is a rebuildable semantic read model, never the source of truth.
- `contexture-bridge` owns the long-lived source-agnostic semantic contracts;
  this repository owns the factory streaming contracts and maps accepted facts
  into Contexture observations, evidence, candidates, review decisions, and
  projection requests.
- Treat the double-repo structure as the default long-term shape. Do not assume
  manufacturing runtime code must eventually move into `contexture-bridge`;
  preserve federation through contracts unless the user explicitly asks for a
  physical repo merge.

The target high-volume telemetry path is:

`MQTT -> Go Gateway -> Kafka -> NestJS/Mastra Worker x N -> PostgreSQL`

Do not simplify this architecture to one runtime or one database when a
problem appears. Control complexity through sequencing, Compose profiles,
capacity adjustment, contract tests, idempotency, and observability.

## Service Boundaries

### Next.js

- Owns the browser UI and thin BFF route handlers.
- Uses HTTP/JSON for ordinary Go Gateway query and command endpoints.
- May use WebSocket or SSE for interactive sessions and live state.
- Must not connect directly to Kafka or Neo4j.

### Go Gateway

- Owns HTTP, WebSocket, SSE, SSH, and MQTT ingress boundaries.
- Owns session routing, Kafka production, query APIs, and restricted Neo4j
  reads.
- Must not persist raw telemetry directly to PostgreSQL.
- Must not expose a general Cypher proxy.
- SSH must expose only application-controlled terminal sessions, never an OS
  shell.

### NestJS Worker

- Runs as a Kafka consumer without requiring an HTTP server.
- Owns deterministic validation and rules, idempotency, conditional Mastra
  workflow execution, PostgreSQL persistence, and result/audit publication.
- Must remain one service/image that supports
  `docker compose up --scale worker=2` and higher scales.
- Do not set `container_name` on the worker service.
- Do not invoke Mastra or an LLM for every telemetry event.

### Kafka

- Go and workers communicate through the Apache Kafka wire protocol, not HTTP
  or gRPC. Current domain payloads are versioned UTF-8 JSON governed by JSON
  Schema.
- Kafka is not an RPC bus. Synchronous reads, lightweight commands, and session
  traffic bypass Kafka.
- Use at-least-once delivery, idempotency, and manual offset commit after
  successful durable processing.
- Never claim exactly-once processing without a separately proven guarantee.

### Rust Graph Worker And Neo4j

- Consume `semantic.graph.rebuild` first and
  `semantic.relation.changed` when relation mutation exists.
- Update only the rebuildable Neo4j projection.
- Keep PostgreSQL/outbox data authoritative.
- Keep traversal depth, timeout, result size, and stale-projection decisions in
  Go read APIs.

Do not add Spring Boot during this implementation stage.

## Contracts And Persistence

- Treat `contracts/*.schema.json` as the language-neutral message contract
  source of truth.
- Keep schema versions explicit, such as `telemetry.v1`.
- Validate external data at runtime boundaries in every consuming language.
- Preserve event IDs, correlation IDs, sequence numbers, and timestamps across
  services.
- Use PostgreSQL uniqueness and idempotent writes to tolerate Kafka
  redelivery.
- Use structured parsers and serializers instead of ad hoc string handling.
- Keep the existing SQLite baseline operational until its replacement is
  implemented and verified. Do not silently remove or bypass it.

## Repository Work Style

- Inspect the repository and current Git diff before editing.
- Existing and uncommitted changes belong to the user unless clearly created
  during the active task. Preserve them and do not revert them.
- Keep edits scoped to the requested feature or bug.
- Prefer existing project patterns over one-off abstractions.
- Use `rg` for repository search when available.
- Add focused tests in proportion to behavioral risk and blast radius.
- State exactly which commands were run. Never report unexecuted tests as
  passing.
- Keep `docs/current-state-before-2nd-plan.md` as the pre-scaffolding inventory. Record later
  implementation work in numbered handoff documents.

## Build And Deployment

Production deployment is always performed manually by the maintainer.

- Agents must never execute `.fordeploy/deploy.sh`, replace AWS containers,
  change ALB/DNS/security-group state, or otherwise perform a production or
  `aws-demo` deployment.
- Agents may edit deployment files and run non-mutating static validation such
  as `bash -n` and `docker compose config`.
- Do not run production image builds unless the user explicitly asks for a
  local build verification. Editing a deployment script does not itself grant
  permission to build or deploy.
- Do not copy secrets, private keys, full environment files, or credential
  contents into source files, documentation, logs, or responses.
- Do not create or modify SSH keys.

Use the established private-instance route for read-only AWS inspection:

1. `ssh aws-bastion`
2. From the bastion, use the `aws-demo` alias.

Prefer read-only commands such as `hostname`, `uptime`, `uname -m`, `free -m`,
`df -h /`, `docker ps`, and `docker system df`. Do not stop, remove, prune, or
restart remote resources during inspection.

The second-stage deployment model is:

1. Require the maintainer's working checkout to be clean and at the same commit
   as `origin/main`.
2. Create or refresh the dedicated clean clone at
   `~/deploy-remote-repo/semantic-layer-explore` from `origin/main`.
3. Build all application images from that clean clone, never directly from the
   IntelliJProjects working checkout, locally in WSL for `linux/amd64`.
4. Pull required official infrastructure images locally.
5. Save versioned images to an archive.
6. Transfer the archive and Compose configuration through the bastion to
   `aws-demo`.
7. Run only `docker load` and Docker Compose on EC2; do not build application
   images on EC2.
8. Keep versioned image tags and the previous release metadata for rollback.

The clean-clone refresh may use `reset --hard` and `clean -fdx` only after the
resolved target has been verified as the dedicated project clone under
`~/deploy-remote-repo`. Never run those commands in the maintainer's working
checkout. Log the exact commit used for the image build.

With graph profile and two workers, distinguish images from containers:

- Four locally built application images: frontend, Go API, NestJS worker, Rust
  graph worker.
- Four official infrastructure images: PostgreSQL, Kafka, Mosquitto, Neo4j.
- Eight unique images create eleven containers because worker has two
  instances, while `migrate` reuses PostgreSQL and `kafka-init` reuses Kafka.
- Eleven containers are created; `migrate` and `kafka-init` exit successfully,
  leaving nine long-running containers.

The `aws-demo` instance size is a capacity setting, not an architecture scope
limit. `t3a.medium` is an initial experiment target; move to `t3a.large` or
larger when measured memory, swap, I/O, CPU, or PSI requires it.

## Frontend Rules

- Preserve the existing visual language, responsiveness, and interaction
  patterns unless the request explicitly changes the UI.
- Operational interfaces should remain quiet, dense, and optimized for
  scanning and repeated action.
- Use the existing component and icon libraries instead of introducing one-off
  SVGs or controls.
- Verify relevant desktop and mobile layouts when changing frontend behavior.
- Infrastructure-only scaffolding and deployment changes should not alter the
  visible UI/UX.

## Next.js Version Rule

This repository may use a Next.js version with APIs and conventions newer than
the agent's training data. Before changing Next.js behavior, read the relevant
guides under `node_modules/next/dist/docs/` and follow current deprecation
notices and repository conventions.

## Review Checklist

Before declaring second-stage work complete, confirm the relevant subset:

- Existing Next.js baseline still builds and tests.
- Contract producers and consumers agree on the same schema version.
- Telemetry follows the required path and Go does not write it directly to
  PostgreSQL.
- Worker persistence completes before offset commit.
- Duplicate event delivery remains idempotent.
- Two or more workers receive Kafka partition assignments correctly.
- No worker service uses `container_name`.
- Neo4j remains rebuildable and is not queried directly by Next.js.
- Compose profiles and container counts match the documented deployment shape.
- AWS capacity statements are based on measured values, not assumptions.
- Placeholder MQTT, SSH, Mastra, graph, or UI work is clearly labeled pending.
