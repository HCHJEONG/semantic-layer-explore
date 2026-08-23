export type TelemetryEvent = {
  schemaVersion: "telemetry.v1";
  eventId: string;
  deviceId: string;
  sensorId: string;
  sequence: number;
  measuredAt: string;
  source?: string;
  payload: {
    kind: "temperature" | "light" | "distance" | "button";
    value: number | boolean;
    unit: string;
  };
  correlationId?: string;
  sessionId?: string;
};

export function parseTelemetry(buffer: Buffer): TelemetryEvent {
  const value = JSON.parse(buffer.toString("utf8")) as unknown;
  if (!isTelemetryEvent(value)) {
    throw new Error("Invalid telemetry event");
  }
  return value;
}

function isTelemetryEvent(value: unknown): value is TelemetryEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<TelemetryEvent>;
  if (event.schemaVersion !== "telemetry.v1") return false;
  if (!event.eventId || !event.deviceId || !event.sensorId) return false;
  if (typeof event.sequence !== "number" || !Number.isInteger(event.sequence) || event.sequence < 0) return false;
  if (!event.measuredAt || Number.isNaN(Date.parse(event.measuredAt))) return false;
  if (!event.payload || typeof event.payload !== "object") return false;
  if (!["temperature", "light", "distance", "button"].includes(event.payload.kind)) return false;
  if (typeof event.payload.value !== "number" && typeof event.payload.value !== "boolean") return false;
  return typeof event.payload.unit === "string" && event.payload.unit.length > 0;
}
