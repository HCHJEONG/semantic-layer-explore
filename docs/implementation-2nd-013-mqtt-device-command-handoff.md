# Second-Stage Handoff 013: MQTT Device Commands And ACK

Date: 2026-08-23

## Implemented

- PostgreSQL `device_command` is the authoritative command lifecycle store with `pending`, `published`, `succeeded`, and `failed` states.
- Manual Next.js commands remain thin BFF requests to Go. Go validates the device command, records it as pending, and publishes `command.v1` to `devices/{deviceId}/commands`.
- Deterministic NestJS rules now record pending commands instead of mutating device state or claiming immediate success.
- The Go MQTT adapter dispatches pending rule commands, subscribes to `devices/+/command-results`, validates the `command-result.v1` boundary, and publishes results to Kafka `command.result`.
- NestJS workers consume telemetry and command results as the same scalable consumer group. Only an ACK result finalizes the command, updates device state on success, and writes `device.command.succeeded` or `device.command.failed` evidence.
- The Python telemetry simulator now also acts as a contract-compatible virtual device: it subscribes to command topics, applies LED/relay/servo/buzzer transitions, deduplicates command IDs, and publishes ACKs.
- Simulator controls cover ACK enablement, delay, negative ACK rate, and dropped ACK rate. Go converts an expired ACK wait into a failed command result using a configurable timeout.
- The existing actuator cards show `Pending ACK` while awaiting a result and `Failed` after a negative result. No new UI tab was added.

## Configuration

```text
SIM_COMMAND_ACK_ENABLED=true
SIM_COMMAND_ACK_DELAY_MS=100
SIM_COMMAND_FAILURE_RATE=0.01
SIM_COMMAND_ACK_DROP_RATE=0
COMMAND_ACK_TIMEOUT_SECONDS=10
```

The simulator is only one implementation of the MQTT command/result contract. Go, Kafka, NestJS, PostgreSQL, and the UI do not depend on simulator-specific payloads or identities.
The default virtual-device failure rate is one percent and can be overridden from zero through one with `SIM_COMMAND_FAILURE_RATE`.

## Verified

- Go formatting and `go test ./...` passed.
- Worker build and tests passed, including command-result parsing.
- Python simulator tests passed inside its image, including idempotent ACK and forced negative ACK.
- Next.js production image built successfully.
- Compose configuration validation passed.
- Manual fan command E2E completed `202 pending -> MQTT -> Python ACK -> Kafka command.result -> worker -> PostgreSQL succeeded`; fan state changed to `on`.
- Forced negative ACK completed as `failed` with `simulated device failure` and did not use an optimistic state update.
- A telemetry-triggered PostgreSQL rule produced a rule-engine command that completed through the same MQTT ACK path and changed fan state to `off`.
- Dropped ACK with a two-second test timeout completed as `failed` with `device acknowledgement timeout`.
- Browser verification observed `Pending ACK` immediately after a command and the confirmed device state after worker finalization.

The local verification stack and disposable volumes were removed after testing.
