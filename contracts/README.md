# contracts

Language-neutral JSON Schema contracts for `semantic-layer-explore`.

This repository owns operational contracts for the industrial streaming path,
including telemetry, commands, command results, dead letters, audit events,
agent results, and current graph rebuild triggers.

## Relationship To Contexture Contracts

The long-lived semantic contracts are owned by `contexture-bridge`:

```text
contexture.observation.v1
contexture.evidence.v1
contexture.semantic-candidate.v1
contexture.review-decision.v1
contexture.projection-request.v1
```

Do not replace high-volume Kafka payloads with these generic contracts. Instead,
adapt accepted operational facts into Contexture contracts at the semantic
ingestion boundary.

This repository is a manufacturing vertical runtime. It can remain a separate
repository indefinitely while still feeding executive-level semantic views
through Contexture contracts.

See `docs/contexture-contract-alignment.md` for the mapping.
