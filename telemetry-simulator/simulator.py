import json
import os
import random
import signal
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlparse

import paho.mqtt.client as mqtt


@dataclass(frozen=True)
class Sensor:
    sensor_id: str
    kind: str
    unit: str
    fallback: float | bool


SENSORS = [
    Sensor("temperature-01", "temperature", "celsius", 24.0),
    Sensor("light-01", "light", "lux", 550.0),
    Sensor("distance-01", "distance", "centimeter", 120.0),
    Sensor("button-01", "button", "boolean", False),
]

SCENARIOS = {
    "normal",
    "high-temperature",
    "dark-room",
    "object-approaching",
    "button-pressed",
    "sensor-disconnected",
}


def env_int(name: str, fallback: int, minimum: int | None = None) -> int:
    raw = os.getenv(name, "").strip()
    value = int(raw) if raw else fallback
    if minimum is not None:
        value = max(minimum, value)
    return value


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def now_rfc3339() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_mqtt_url(raw_url: str) -> tuple[str, int]:
    parsed = urlparse(raw_url)
    if parsed.scheme not in {"mqtt", "tcp"}:
        raise ValueError("SIMULATOR_MQTT_URL must use mqtt:// or tcp://")
    if not parsed.hostname:
        raise ValueError("SIMULATOR_MQTT_URL must include a host")
    return parsed.hostname, parsed.port or 1883


class WorkspaceTelemetrySimulator:
    def __init__(self) -> None:
        self.device_id = os.getenv("SIMULATOR_DEVICE_ID", "workspace-simulator-01").strip()
        self.topic_prefix = os.getenv("SIMULATOR_TOPIC_PREFIX", "devices").strip().strip("/")
        self.events_per_hour = env_int("SIMULATOR_EVENTS_PER_HOUR", 60, minimum=1)
        self.seed = env_int("SIMULATOR_SEED", 20260804)
        self.scenario = os.getenv("SIMULATOR_SCENARIO", "normal").strip() or "normal"
        if self.scenario not in SCENARIOS:
            raise ValueError(f"Unknown SIMULATOR_SCENARIO: {self.scenario}")

        self.random = random.Random(self.seed)
        self.sequence = 0
        self.values: dict[str, float | bool] = {sensor.sensor_id: sensor.fallback for sensor in SENSORS}
        self.running = True

    def stop(self, *_args: object) -> None:
        self.running = False

    def interval_seconds(self) -> float:
        return 3600.0 / float(self.events_per_hour)

    def topic(self) -> str:
        return f"{self.topic_prefix}/{self.device_id}/telemetry"

    def next_event(self) -> dict[str, object] | None:
        sensor = SENSORS[self.sequence % len(SENSORS)]
        if self.scenario == "sensor-disconnected" and sensor.sensor_id == "temperature-01":
            self.sequence += 1
            return None

        value = self.next_value(sensor)
        self.values[sensor.sensor_id] = value
        self.sequence += 1

        return {
            "schemaVersion": "telemetry.v1",
            "eventId": str(uuid.uuid4()),
            "deviceId": self.device_id,
            "sensorId": sensor.sensor_id,
            "sequence": self.sequence,
            "measuredAt": now_rfc3339(),
            "source": "mqtt",
            "payload": {
                "kind": sensor.kind,
                "value": value,
                "unit": sensor.unit,
            },
        }

    def next_value(self, sensor: Sensor) -> float | bool:
        if self.scenario == "high-temperature" and sensor.sensor_id == "temperature-01":
            return 31.5
        if self.scenario == "dark-room" and sensor.sensor_id == "light-01":
            return 60
        if self.scenario == "object-approaching" and sensor.sensor_id == "distance-01":
            return 8.0
        if self.scenario == "button-pressed" and sensor.sensor_id == "button-01":
            return True

        previous = self.values[sensor.sensor_id]
        if sensor.sensor_id == "temperature-01":
            return round(clamp(float(previous) + (self.random.random() - 0.5) * 0.7, 20, 35), 1)
        if sensor.sensor_id == "light-01":
            return round(clamp(float(previous) + (self.random.random() - 0.5) * 50, 20, 1000))
        if sensor.sensor_id == "distance-01":
            return round(clamp(float(previous) + (self.random.random() - 0.5) * 12, 5, 200), 1)
        return self.random.random() < 0.03


def main() -> None:
    simulator = WorkspaceTelemetrySimulator()
    signal.signal(signal.SIGTERM, simulator.stop)
    signal.signal(signal.SIGINT, simulator.stop)

    host, port = parse_mqtt_url(os.getenv("SIMULATOR_MQTT_URL", "mqtt://mosquitto:1883"))
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"{simulator.device_id}-publisher")
    client.connect(host, port, keepalive=30)
    client.loop_start()

    print(
        json.dumps(
            {
                "event": "telemetry-simulator.started",
                "deviceId": simulator.device_id,
                "topic": simulator.topic(),
                "eventsPerHour": simulator.events_per_hour,
                "scenario": simulator.scenario,
            }
        ),
        flush=True,
    )

    try:
        while simulator.running:
            event = simulator.next_event()
            if event is not None:
                payload = json.dumps(event, separators=(",", ":"))
                result = client.publish(simulator.topic(), payload=payload, qos=1)
                result.wait_for_publish()
                print(json.dumps({"event": "telemetry.published", "eventId": event["eventId"]}), flush=True)
            time.sleep(simulator.interval_seconds())
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
