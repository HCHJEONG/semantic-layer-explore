# Second-Stage Handoff 014: SQLite Retirement

Date: 2026-08-23

## Implemented

- PostgreSQL is now the only authoritative application store. Neo4j remains a rebuildable projection.
- Next.js ontology, operational, rules, events, SSE, command, and causal-trace routes are unconditional thin BFFs to the Go Gateway.
- SQLite/Drizzle stores, schema, migrations, in-process runtime, retention scheduler, and TypeScript simulator adapter were removed.
- `better-sqlite3`, Drizzle ORM, Drizzle Kit, and their type dependencies were removed from the root package and lockfile.
- The legacy backend selector environment variables, database path, frontend data volume, native build packages, and Drizzle image copy were removed.
- The old in-process simulator control routes and dashboard scenario controls were removed. The Python MQTT simulator is the sole virtual-device and telemetry simulator.
- Rule Proposal target validation now reads sensors and devices through the application APIs backed by Go/PostgreSQL.
- Tests now enforce the Go-only BFF boundary and reject reintroduction of SQLite/Drizzle references.

## AWS Archive

The deployed `aws-demo` SQLite files were copied without deleting the originals or restarting containers:

```text
/home/ubuntu/semantic-layer-explore/_archive/sqlite-retired-20260823T083049Z/
```

The archive contains the main database, WAL, and SHM files, approximately 158 MB total. The source and archived main database SHA-256 values matched:

```text
37927e029da0e2307214b28db1c69a0107c71a1d84d576e9c8a58f35d3309e93
```

No deployment, container restart, or remote original-file deletion was performed.

## Verification

- Next.js production build passed after all SQLite code and dependencies were removed.
- Compose configuration validation passed without a frontend data volume or database fallback variables.
- Fresh Compose images built and a two-worker simulator stack verified ontology/state BFF reads plus MQTT command ACK finalization; the frontend image contained no SQLite or Drizzle files.
- Root tests cover Go-only BFF routes, absence of SQLite/Drizzle dependencies, ontology-first AI behavior, Neo4j Explorer, MQTT contracts, and the Python simulator one-percent failure default.
