# Implementation 2nd 007 Worker Mastra UI Handoff

Date: 2026-08-23

## Scope

This step made NestJS worker Mastra activity visible from the Next.js dashboard
and reduced UI ambiguity with the existing root Next.js explain workflow.

No AWS deployment was performed by the agent.

## Changes

- Split the worker telemetry decision result construction out of
  `MastraDecisionService`.
  - Added `worker/src/agent-result/telemetry-decision.ts`.
  - The builder emits the same `agent-result.v1` shape used for Kafka
    `agent.result` publication and PostgreSQL `audit_event` persistence.
- Added a Go Gateway read endpoint:
  - `GET /operations/agent-results?limit=N`
  - Reads recent worker Mastra audit records from PostgreSQL.
  - Returns status, mode, trigger, summary, related telemetry identifiers, and
    timestamps.
- Added a Next.js BFF route:
  - `GET /api/operations/agent-results?limit=N`
  - Proxies to the Go Gateway.
- Updated the dashboard.
  - Added a `NESTJS WORKER / Mastra Activity` panel.
  - The panel polls only distributed operations data, so MQTT worker results
    appear even though the original SQLite workspace SSE stream is separate.
  - Existing AI decision metric remains as the count summary.
- Clarified the existing AI Explain UI labels.
  - The Next.js route still runs the local explain workflow.
  - The UI now labels it as `LOCAL EXPLAIN WORKFLOW` and `Local Explain Graph`
    to avoid implying it is the NestJS worker activity panel.

## Verification

Commands run:

```sh
cd /home/hchjeong/IntelliJProjects/semantic-layer-explore/worker && npm run build
cd /home/hchjeong/IntelliJProjects/semantic-layer-explore && npm run build
docker run --rm -v /home/hchjeong/IntelliJProjects/semantic-layer-explore/api:/src -w /src golang:1.22-bookworm /bin/sh -c '/usr/local/go/bin/gofmt -w internal/persistence/postgres.go internal/httpapi/router.go && /usr/local/go/bin/go test ./...'
POSTGRES_PASSWORD=physicalai NEO4J_PASSWORD=physicalai docker compose config >/tmp/semantic-compose-config.yaml
POSTGRES_PASSWORD=physicalai NEO4J_PASSWORD=physicalai PHYSICALAI_VERSION=static-check DATA_DIR_ON_PRIVATE=/tmp/physicalai-data GCP_KEY_ON_PRIVATE=/tmp/gcp-key.json docker compose -f .fordeploy/compose.aws-demo.yaml config >/tmp/semantic-aws-compose-config.yaml
bash -n .fordeploy/deploy.sh
SIMULATOR_EVENTS_PER_HOUR=3600 SIMULATOR_SCENARIO=high-temperature MASTRA_TELEMETRY_MODE=dry-run POSTGRES_PASSWORD=physicalai NEO4J_PASSWORD=physicalai docker compose --profile simulator up -d --scale worker=2 --build
curl -fsS "http://127.0.0.1:8080/operations/agent-results?limit=3"
curl -fsS "http://127.0.0.1:3000/api/operations/agent-results?limit=3"
curl -fsS http://127.0.0.1:3000/api/operations/summary
docker compose exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka:9092 --describe --group physicalai-telemetry-workers
docker compose logs --since=20s worker api frontend
```

Observed local smoke results:

- Go `/operations/agent-results?limit=3` returned recent worker decisions.
- Next.js `/api/operations/agent-results?limit=3` returned the same records.
- Records included `kind: "impact-analysis"`, `status: "skipped"`,
  `mode: "dry-run"`, `trigger: "temperature-threshold"`, telemetry IDs, and
  sensor values.
- Next.js `/api/operations/summary` continued to return the latest worker
  decision summary.
- Worker group lag for populated telemetry partitions was `0`.
- Two worker containers were assigned Kafka partitions.
- The latest 20 seconds of worker/API/frontend logs contained no errors.

## Notes

- The root Next.js explain-event route has not been moved into the worker yet.
  It is now visually labeled as a local explain workflow.
- The dashboard now shows worker Mastra telemetry decisions from PostgreSQL via
  Go/Next operations APIs.
- Chrome DevTools navigation was not available in the exposed tool set, so
  visual verification was limited to successful production build and HTTP data
  checks in this turn.

## Next Recommended Step

Proceed to Rust graph worker implementation:

1. Consume `semantic.graph.rebuild`.
2. Read authoritative PostgreSQL semantic records.
3. Project the minimal ontology graph into Neo4j.
4. Expose projection status through Go.
5. Add a small Next.js status/read view without connecting Next.js directly to
   Neo4j.
