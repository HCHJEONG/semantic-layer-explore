# Second-Stage Handoff 015: MQTT Outbound Retry, Failure UX, And Explain Evidence

Date: 2026-08-23

## Why this stage was needed

Handoff 013 added MQTT commands and device ACK handling, but an MQTT publish failure left a command pending without a bounded terminal outcome. The UI could show a negative ACK or ACK timeout only after MQTT publishing had succeeded; it could not explain a command that never reached the device.

This stage closes that gap. It makes outbound publishing an observable lifecycle, bounds retries, routes exhausted publishing through the existing Kafka/worker finalization boundary, and exposes transport-failure evidence through the existing Operations and Explain UI. No new tab was added.

Read this document after:

1. `implementation-2nd-013-mqtt-device-command-handoff.md` for the command/ACK contract.
2. `implementation-2nd-014-sqlite-retirement-handoff.md` for the PostgreSQL-only application state.

## End-to-end architecture

```text
Next.js command BFF
  -> Go HTTP command validation
  -> PostgreSQL device_command: pending
  -> Go MQTT dispatcher claim: publishing
  -> Mosquitto command topic
  -> device or Python simulator
  -> Mosquitto command-result topic
  -> Go Kafka producer: command.result
  -> NestJS worker
  -> PostgreSQL terminal command + workspace event
  -> Go query/SSE APIs
  -> existing Next.js device cards, timeline, and Explain workflow
```

If MQTT publishing fails before the device receives the command:

```text
publishing -> retrying -> publishing -> ... -> finalizing
  -> synthetic command-result.v1 on Kafka
  -> NestJS worker -> failed + device.command.failed
```

Go owns transport attempts and their metadata. NestJS owns the durable terminal result. This preserves one finalization path for MQTT publish exhaustion, negative device ACK, and ACK timeout.

## Command states

| PostgreSQL status | Meaning | Owner of transition | UI label |
| --- | --- | --- | --- |
| `pending` | Command is durably queued but not claimed | Go HTTP or NestJS rule execution | Queued |
| `publishing` | A Go dispatcher atomically claimed and is attempting MQTT publish | Go | Publishing |
| `retrying` | Publish failed but retry budget remains | Go | Retrying `n/max` |
| `published` | MQTT QoS 1 publish completed; device ACK is pending | Go | Awaiting ACK |
| `finalizing` | Publish attempts are exhausted; a synthetic failure result is awaiting worker finalization | Go/Kafka boundary | Failed |
| `succeeded` | Positive device ACK was durably applied | NestJS worker | Confirmed device state |
| `failed` | Negative ACK, ACK timeout, or publish exhaustion was durably applied | NestJS worker | Failed |

`finalizing` is intentionally not the authoritative final failure. It lets Go retry Kafka delivery of the synthetic result without claiming that worker persistence has already happened.

## Persistence changes

Migration `infra/postgres/migrations/008_device_command_publish_retry.sql` extends `device_command` with:

- `publish_attempts`: number of dispatcher claims that performed an MQTT attempt.
- `last_attempt_at`: time of the latest claimed publish attempt.
- `next_attempt_at`: retry eligibility time or delayed synthetic-result publication time.
- `failure_code`: stable machine-readable failure classification.

The migration extends the status constraint with `publishing`, `retrying`, and `finalizing`, and adds a retry-oriented index.

Go uses a PostgreSQL `FOR UPDATE SKIP LOCKED` claim followed by one `UPDATE ... RETURNING`. This prevents multiple Go gateway instances from counting or publishing the same ready attempt concurrently.

Retry scheduling and its `device.command.publish-retrying` workspace event are written in one PostgreSQL transaction. Event IDs include the command ID and attempt number, so repeated scheduling remains idempotent.

## Retry calculation

```text
delay = min(initialDelay * 2^(attempt-1), maximumDelay)
```

Configuration:

```text
MQTT_COMMAND_MAX_PUBLISH_ATTEMPTS=3
MQTT_COMMAND_RETRY_INITIAL_MS=500
MQTT_COMMAND_RETRY_MAX_MS=5000
COMMAND_ACK_TIMEOUT_SECONDS=10
```

Defaults are declared in Go config and passed through both local and AWS Compose files. The ACK timeout is separate: retry settings apply before a successful MQTT publish, while ACK timeout applies after status becomes `published`.

## Important implementation decisions

### One dispatcher owns MQTT attempts

The manual Go HTTP handler previously inserted the command and immediately attempted MQTT publishing, while the background dispatcher could also find pending commands. That made attempt accounting and concurrent ownership ambiguous.

The handler now validates and persists the command, returns HTTP `202` with `status: queued`, and leaves every MQTT attempt to the dispatcher. Rule-generated commands already enter the same PostgreSQL queue, so manual and deterministic rule commands now share the same transport behavior.

### Worker-only terminal finalization

After the final MQTT failure, Go sets `finalizing` and produces this failure shape to Kafka `command.result`:

```json
{
  "schemaVersion": "command-result.v1",
  "commandId": "...",
  "deviceId": "...",
  "success": false,
  "error": "mqtt adapter is not connected",
  "failureCode": "mqtt.publish.exhausted",
  "publishAttempts": 3,
  "occurredAt": "..."
}
```

The language-neutral JSON Schema and NestJS parser now accept `failureCode` and `publishAttempts`. The worker updates `device_command`, preserves the largest attempt count, and inserts the idempotent terminal `device.command.failed` workspace event.

Negative device ACKs without a supplied code are normalized to `device.command.rejected`. ACK timeouts use `device.ack.timeout`. Successful ACK behavior and device-state updates are unchanged.

### Kafka publication remains retryable

Commands in `finalizing` are queried separately from MQTT-dispatchable commands. Go republishes the synthetic Kafka result on a short delay until the worker changes the command to `failed`. Kafka redelivery and repeated synthetic results are tolerated by the worker's existing terminal-state idempotency.

## UI and Explain behavior

The existing Virtual Devices cards read the latest command metadata from the Go state API. Active lifecycle states disable another command for that device. The transport error is also available as the card title text.

The existing Event Timeline now describes:

- `device.command.pending` as queued.
- `device.command.publish-retrying` with current and maximum attempt counts.
- exhausted `device.command.failed` as an MQTT command publish failure.

Only terminal `device.command.succeeded` and `device.command.failed` events show Explain Why. Retry events do not create partial explanations.

For a failed command, the Go causal-trace API now keeps the original rule/sensor provenance and adds `command-failure` evidence. It distinguishes:

- why the command was generated, when linked rule and sensor evidence exists;
- why execution failed, including failure code, transport/ACK phase, error, and publish-attempt count.

The existing Mastra execution reviewer includes both `device-execution` and `command-failure`. The critic/verifier therefore treats MQTT failure details as cited, proven evidence rather than free-form UI text.

## File map

- `infra/postgres/migrations/008_device_command_publish_retry.sql`: retry metadata and status constraint.
- `contracts/command-result.schema.json`: cross-language failure evidence contract.
- `api/internal/config/config.go`: environment defaults.
- `api/internal/persistence/commands.go`: atomic claim, retry transaction, exhaustion queue, ACK timeout queries.
- `api/internal/mqtt/adapter.go`: retry/backoff loop and synthetic Kafka failure.
- `api/internal/httpapi/operations.go`: queued command response and state DTO enrichment.
- `api/internal/persistence/operations.go`: latest command metadata returned with devices.
- `worker/src/contracts/command-result.ts`: runtime command-result validation.
- `worker/src/persistence/postgres-service.ts`: terminal status, failure-code normalization, and workspace event.
- `api/internal/httpapi/events.go`: causal failure evidence and failure-aware title/summary.
- `lib/explain/workflow.ts`: execution reviewer includes command-failure evidence.
- `domain/physical.ts`: frontend lifecycle DTO.
- `components/dashboard/workspace-dashboard.tsx`: existing card/timeline labels and Explain button behavior.
- `.env.example`, `compose.yaml`, `.fordeploy/compose.aws-demo.yaml`: configuration surface.
- `worker/test/command-result.test.mjs`: bounded publish-failure contract test.

## Local failure-injection E2E

The local stack was built with:

```text
MQTT_COMMAND_MAX_PUBLISH_ATTEMPTS=2
MQTT_COMMAND_RETRY_INITIAL_MS=100
MQTT_COMMAND_RETRY_MAX_MS=200
```

Mosquitto was stopped, and a manual `relay-fan-01 on` command was submitted. The observed events were:

1. `device.command.pending`
2. `device.command.publish-retrying` with attempt `1/2`
3. `device.command.failed` with `failureCode: mqtt.publish.exhausted` and `publishAttempts: 2`

The state API returned the relay as `failed`, retained its previous `off` state, and exposed the error `mqtt adapter is not connected`. The causal-trace API returned:

- title: `Why did relay-fan-01 on fail?`
- evidence label: `MQTT outbound failure`
- detail: MQTT was not connected after two publish attempts
- support: `proven`

Browser verification confirmed the same failure in the existing device card, timeline, and Explain workflow. The execution reviewer showed both the command event and MQTT failure, and the deterministic verifier accepted two proven claims. Mosquitto was restarted after the test.

## Commands actually run

```text
cd api && gofmt -w ... && go test ./...
cd worker && npm test -- --runInBand
npm run lint && npm test -- --runInBand
docker compose config --quiet
MQTT_COMMAND_MAX_PUBLISH_ATTEMPTS=2 \
MQTT_COMMAND_RETRY_INITIAL_MS=100 \
MQTT_COMMAND_RETRY_MAX_MS=200 \
docker compose up -d --build
docker compose stop mosquitto
docker compose start mosquitto
git diff --check
```

Results:

- Go packages compiled and passed; no Go test files currently exist.
- Worker TypeScript build passed and four Node tests passed.
- Next.js lint, production build, and six Node tests passed.
- Compose configuration and image builds passed.
- The failure-injection E2E and browser Explain verification passed.

## Operational notes and follow-up boundaries

- This work was verified locally only. No AWS deployment was performed in this stage.
- The state response still reports the configured MQTT adapter, not a live broker-health probe. Command lifecycle and failure evidence are authoritative for an individual outbound command.
- Retry events are PostgreSQL audit/UI events; final command results remain worker-owned.
- PostgreSQL is authoritative, Neo4j is unrelated to command delivery, and SQLite is not used.
