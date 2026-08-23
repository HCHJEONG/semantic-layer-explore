# Second-Stage Handoff 012: Neo4j Explorer View

Date: 2026-08-23

## Implemented

- The existing Semantic Map tab now contains an in-place `Source / Projection` graph switch. No new top-level tab was added.
- Source mode preserves the PostgreSQL-authoritative ontology visualization.
- Projection mode reads the bounded Neo4j result through `Next BFF -> Go -> Neo4j` and renders Class, Property, and Individual nodes plus semantic relation edges.
- Projection status, node/relation counts, completion time, offline/failed/loading states, and rebuild control are available in the graph header.
- Selecting a node shows its projection ID, kind, class name, and external ID in a detail strip.
- Projection nodes use a compact kind-grouped layout with React Flow pan, zoom, fit, and minimap controls.
- The existing dashboard projection status panel remains a compact operational summary; detailed graph inspection belongs to Semantic Map.

## Verified

- Next production build passed.
- Graph-profile Compose images built and started locally.
- `semantic.graph.rebuild` completed with status `ready`.
- PostgreSQL/Rust/Neo4j E2E produced 30 nodes and 14 semantic relations.
- Browser verification confirmed Source and Projection switching, 30 rendered projection nodes, relation labels, rebuild control, and selected-node details.
- Mobile viewport verification confirmed no horizontal document overflow and all 30 React Flow nodes present.
- A focused regression assertion covers the in-place projection controls and graph endpoints.

The local graph-profile stack and disposable volumes were removed after verification.

## Current Completion Boundary

The planned authoritative-store migration and its principal UI read paths are now complete:

1. Ontology: PostgreSQL authority, Neo4j projection, SQLite legacy.
2. Rules/sensors/devices: PostgreSQL authority and deterministic NestJS rule evaluation.
3. Events/Explain: PostgreSQL event authority, Go SSE/causal trace, existing Mastra review UI.
4. Explorer: explicit PostgreSQL source and Neo4j projection views in one existing tab.

This closes the current data-ownership, telemetry-processing, causal-explanation, and graph-inspection implementation sequence. It does not claim that every item in the broader second-stage architecture plan is complete. Physical MQTT outbound commands, completed SSH/Scene IR sessions, load/failure experiments, richer bounded graph traversal queries, and production rollout remain separately gated work.
