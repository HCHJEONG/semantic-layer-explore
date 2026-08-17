import { z } from "zod";

export const sensorTypeSchema = z.enum(["temperature", "light", "distance", "button"]);
export const sensorUnitSchema = z.enum(["celsius", "lux", "centimeter", "boolean"]);
export const deviceTypeSchema = z.enum(["led", "servo", "buzzer", "relay"]);
export const deviceCommandNameSchema = z.enum(["on", "off", "set-angle", "beep"]);

export const sensorReadingSchema = z.object({
  eventId: z.string().min(1),
  sensorId: z.string().min(1),
  sensorType: sensorTypeSchema,
  value: z.union([z.number(), z.boolean()]),
  unit: sensorUnitSchema,
  measuredAt: z.string().datetime(),
  source: z.enum(["simulator", "mqtt"]),
});

export const deviceCommandSchema = z.object({
  commandId: z.string().min(1),
  deviceId: z.string().min(1),
  deviceType: deviceTypeSchema,
  command: deviceCommandNameSchema,
  value: z.number().optional(),
  issuedBy: z.enum(["rule-engine", "user"]),
  issuedAt: z.string().datetime(),
});

export const manualReadingSchema = z.object({ value: z.union([z.number(), z.boolean()]) });

export type SensorType = z.infer<typeof sensorTypeSchema>;
export type SensorUnit = z.infer<typeof sensorUnitSchema>;
export type SensorReading = z.infer<typeof sensorReadingSchema>;
export type DeviceType = z.infer<typeof deviceTypeSchema>;
export type DeviceCommand = z.infer<typeof deviceCommandSchema>;

export type DeviceState = { status: "on" | "off"; angle?: number; lastCommandAt?: string };
export type DeviceCommandResult = { success: boolean; deviceId: string; state: DeviceState; error?: string };
export type ConnectionStatus = { state: "connected" | "disconnected"; adapter: "simulator" | "mqtt"; since: string };

export type SensorDefinition = { id: string; name: string; type: SensorType; unit: SensorUnit };
export type DeviceDefinition = { id: string; name: string; type: DeviceType };

export type SimulatorScenario = "normal" | "high-temperature" | "dark-room" | "object-approaching" | "button-pressed" | "sensor-disconnected";
export type WorkspaceState = {
  mode: "simulator";
  connection: { state: "connected" | "disconnected"; adapter: string };
  simulator: { running: boolean; scenario: SimulatorScenario; intervalMs: number };
  sensors: SensorDefinition[];
  readings: SensorReading[];
  devices: Array<DeviceDefinition & { state: DeviceState }>;
};
