# Second-Stage Handoff 011: Events And Explain Causal Trace

Date: 2026-08-23

## Implemented

- PostgreSQL `workspace_event` is the authoritative distributed event timeline.
- NestJS persists `sensor.reading`, `rule.matched`, and `device.command.succeeded` causal evidence while processing telemetry.
- Rule and command event IDs are deterministic per telemetry event and rule.
- Rule cooldown, device state, matched audit, rule event, and command event commit in one PostgreSQL transaction.
- Go user device commands commit virtual device state and their action event in one transaction.
- Go exposes bounded event listing, cursor-based SSE, and deterministic causal-trace APIs.
- Next.js `/api/events` and `/api/events/stream` are Go BFF routes by default.
- The existing Next Mastra Explain workflow now reviews the deterministic Go/PostgreSQL trace and retains its sensor/rule/execution reviews, optional LLM critic, and final deterministic verifier.
- `EVENTS_BACKEND=sqlite` preserves the complete SQLite event and Explain baseline for legacy standalone operation.
- Go HTTP streaming is not constrained by the ordinary 10-second write timeout.

## Verified

- `go test ./...`
- `cd worker && npm test`: 2 tests passed
- Next production build passed
- `docker compose config --quiet`
- `docker compose up -d --build --scale worker=2`
- PostgreSQL event chain: `sensor.reading -> rule.matched -> device.command.succeeded`
- Next event BFF returned the PostgreSQL timeline
- Next SSE BFF streamed ordered event IDs and `workspace-event` payloads
- Rule command Explain returned `complete`, steps `sensor/rule/execution`, three proven evidence records, and three verified Mastra claims
- Manual user command Explain returned `partial`, only the execution step, and the expected two missing evidence records
- PostgreSQL contained one sensor event, one rule event, and two command events for the E2E scenario

The E2E records were created only in a disposable local Compose volume.

## Resulting Ownership

- PostgreSQL: authoritative ontology, rules, sensor/device state, telemetry records, event timeline, audit evidence, and outbox
- NestJS: telemetry consumption, deterministic rule evaluation, causal event production, conditional Mastra telemetry decisions
- Go: synchronous operational/event queries, SSE, deterministic causal trace, commands, and protocol ingress
- Next.js: UI, thin BFF, Ask/Proposal APIs, and Explain review workflow
- SQLite: explicit legacy standalone mode
- Neo4j: rebuildable semantic projection

## Next Scope

Expand the Next.js Explorer so users can inspect the actual Neo4j projection result, rather than only projection status/counts and a short Individual-name preview. Keep the PostgreSQL ontology view available so source-of-truth and projection views can be compared explicitly.
