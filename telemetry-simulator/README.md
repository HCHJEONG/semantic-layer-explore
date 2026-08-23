# Telemetry Simulator

Synthetic MQTT telemetry publisher for the distributed telemetry path.

It mirrors the root Next.js simulator's sensor IDs, sensor kinds, units, seeded
random walk, and scenario names while publishing `telemetry.v1` envelopes to
Mosquitto.

## Environment

- `SIMULATOR_EVENTS_PER_HOUR`: total event rate across sensors. Default: `60`.
- `SIMULATOR_SEED`: deterministic random seed. Default: `20260804`.
- `SIMULATOR_SCENARIO`: `normal`, `high-temperature`, `dark-room`,
  `object-approaching`, `button-pressed`, or `sensor-disconnected`.
- `SIMULATOR_DEVICE_ID`: telemetry device ID. Default: `workspace-simulator-01`.
- `SIMULATOR_MQTT_URL`: MQTT broker URL. Default: `mqtt://mosquitto:1883`.
- `SIMULATOR_TOPIC_PREFIX`: MQTT topic prefix. Default: `devices`.
