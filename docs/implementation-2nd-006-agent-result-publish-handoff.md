# Implementation 2nd 006 Agent Result Publish Handoff

Date: 2026-08-23

## Scope

This step made the NestJS worker's conditional Mastra boundary publish its
deterministic telemetry decisions to Kafka as `agent-result.v1` messages.
PostgreSQL `audit_event` remains the operational query source, while
`agent.result` is now available as an integration stream for later consumers.

No AWS deployment was performed by the agent.

## Changes

- Added `worker/src/agent-result/agent-result-publisher.ts`.
  - Uses KafkaJS producer inside the worker process.
  - Publishes JSON messages to `KAFKA_AGENT_RESULT_TOPIC`, defaulting to
    `agent.result`.
  - Includes message headers for schema version, result id, kind, and status.
- Updated worker configuration and DI wiring.
  - `worker/src/config.ts`
  - `worker/src/module.ts`
- Updated `MastraDecisionService`.
  - Builds an `agent-result.v1` impact-analysis result for triggered telemetry.
  - Inserts the decision into PostgreSQL `audit_event` first.
  - Publishes the same decision to Kafka `agent.result` afterward.
  - Keeps live LLM invocation disabled in dry-run mode.
- Added `KAFKA_AGENT_RESULT_TOPIC=agent.result` to environment templates and
  Compose worker environments.
  - `.env.example`
  - `compose.yaml`
  - `.fordeploy/compose.aws-demo.yaml`
- Extended Go operations summary to surface latest Mastra decision details from
  the audit payload.
  - `status`
  - `mode`
  - `trigger`
  - `summary`
- Updated the Next.js operations summary type to accept those fields.

## Verification

Commands run:

```sh
cd /home/hchjeong/IntelliJProjects/semantic-layer-explore/worker && npm run build
cd /home/hchjeong/IntelliJProjects/semantic-layer-explore && npm run build
docker run --rm -v /home/hchjeong/IntelliJProjects/semantic-layer-explore/api:/src -w /src golang:1.22-bookworm /bin/sh -c '/usr/local/go/bin/gofmt -w internal/persistence/postgres.go && /usr/local/go/bin/go test ./...'
POSTGRES_PASSWORD=physicalai NEO4J_PASSWORD=physicalai docker compose config >/tmp/semantic-compose-config.yaml
POSTGRES_PASSWORD=physicalai NEO4J_PASSWORD=physicalai PHYSICALAI_VERSION=static-check DATA_DIR_ON_PRIVATE=/tmp/physicalai-data GCP_KEY_ON_PRIVATE=/tmp/gcp-key.json docker compose -f .fordeploy/compose.aws-demo.yaml config >/tmp/semantic-aws-compose-config.yaml
bash -n .fordeploy/deploy.sh
SIMULATOR_EVENTS_PER_HOUR=3600 SIMULATOR_SCENARIO=high-temperature MASTRA_TELEMETRY_MODE=dry-run POSTGRES_PASSWORD=physicalai NEO4J_PASSWORD=physicalai docker compose --profile simulator up -d --scale worker=2 --build
curl -fsS http://127.0.0.1:8080/operations/summary
curl -fsS http://127.0.0.1:3000/api/operations/summary
docker compose exec -T kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server kafka:9092 --topic agent.result --from-beginning --timeout-ms 7000 --max-messages 1
docker compose exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka:9092 --describe --group physicalai-telemetry-workers
```

Observed local smoke results:

- Go `/operations/summary` returned telemetry, zero dead letters, and Mastra
  decision details including `status: "skipped"`, `mode: "dry-run"`, and
  `trigger: "temperature-threshold"`.
- Next.js `/api/operations/summary` returned the same fields through the BFF.
- Kafka `agent.result` contained an `agent-result.v1` message with
  `kind: "impact-analysis"` and `status: "skipped"`.
- Worker group lag for populated telemetry partitions was `0`.
- Two worker containers were assigned Kafka partitions.

## Remaining Work

- Live Mastra/LLM execution is still not enabled for telemetry.
- The root Next.js explain/propose flows have not been migrated into the
  NestJS worker.
- There is still no consumer for `agent.result`; it is currently a published
  integration stream plus PostgreSQL audit record.
