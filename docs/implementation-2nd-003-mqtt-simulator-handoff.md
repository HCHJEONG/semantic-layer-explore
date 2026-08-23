# 2nd Implementation 003: MQTT Subscriber And Telemetry Simulator

## Purpose

This handoff records the minimal implementation that connects the second-stage
MQTT ingress skeleton to the existing Kafka telemetry path and adds a synthetic
MQTT telemetry producer.

This is not a load-test result document. Any throughput, memory, lag, or AWS
capacity statements still require separate measurement.

## Implemented Scope

- Replaced the Go MQTT listener skeleton with an MQTT client.
- Subscribed the Go Gateway to `MQTT_TELEMETRY_TOPIC`.
- Parsed MQTT payloads as `telemetry.v1`.
- Reused the existing Go telemetry validation and Kafka producer.
- Preserved the rule that Go does not persist raw telemetry directly to
  PostgreSQL.
- Added `telemetry-simulator/` as a separate Python Docker build context.
- Added an opt-in Compose `simulator` profile for the telemetry simulator.
- Added environment-driven simulator rate control through
  `SIMULATOR_EVENTS_PER_HOUR`.

## Compatibility With The Existing Next.js Simulator

The Python MQTT simulator mirrors the current Next.js simulator vocabulary:

- Sensor IDs: `temperature-01`, `light-01`, `distance-01`, `button-01`
- Sensor kinds: `temperature`, `light`, `distance`, `button`
- Units: `celsius`, `lux`, `centimeter`, `boolean`
- Scenario names: `normal`, `high-temperature`, `dark-room`,
  `object-approaching`, `button-pressed`, `sensor-disconnected`
- Seeded random-walk behavior for normal telemetry

The simulator publishes distributed `telemetry.v1` envelopes rather than the
SQLite-facing `SensorReading` shape used by the root Next.js runtime.

## Runtime Shape

With the simulator profile enabled, the path is:

```text
Python telemetry-simulator
  -> Mosquitto
  -> Go MQTT subscriber
  -> Kafka telemetry.raw
  -> NestJS worker
  -> PostgreSQL telemetry_event
```

The simulator is opt-in:

```bash
docker compose --profile simulator up -d --scale worker=2
```

Graph remains separately controlled by the `graph` profile.

## Environment

- `SIMULATOR_EVENTS_PER_HOUR`: total synthetic MQTT events per hour across the
  simulated workspace sensors.
- `SIMULATOR_SEED`: deterministic random seed.
- `SIMULATOR_SCENARIO`: scenario name matching the existing Next.js simulator.
- `SIMULATOR_DEVICE_ID`: MQTT telemetry `deviceId`.
- `SIMULATOR_MQTT_URL`: broker URL inside Compose.
- `SIMULATOR_TOPIC_PREFIX`: defaults to `devices`, producing
  `devices/{deviceId}/telemetry`.

## Not Completed

- MQTT authentication, TLS, mTLS, and external broker exposure.
- Device command/result simulation.
- Load testing or sustained rate testing.
- AWS deployment of this change.
- Retry/dead-letter completion.
- Rust graph projection and Neo4j Cypher projection.
