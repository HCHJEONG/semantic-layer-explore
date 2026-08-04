import "server-only";

import { desc, eq } from "drizzle-orm";
import { SimulatorAdapter } from "@/adapters/simulator/simulator-adapter";
import { getDb } from "@/db";
import { devices, events, sensorReadings } from "@/db/schema";
import { deviceCommandSchema, type DeviceCommand, type SensorReading, type SimulatorScenario } from "@/domain/physical";

class WorkspaceRuntime {
  readonly adapter: SimulatorAdapter;
  private initialized = false;

  constructor() {
    const adapterName = process.env.PHYSICAL_ADAPTER?.trim() || "simulator";
    if (adapterName !== "simulator") throw new Error(`Physical adapter is not implemented: ${adapterName}`);
    const seed = Number(process.env.SIMULATOR_SEED || 20260804);
    const intervalMs = Math.max(250, Number(process.env.SIMULATOR_INTERVAL_MS || 2000));
    this.adapter = new SimulatorAdapter({ seed, intervalMs });
  }

  start() {
    if (!this.initialized) {
      this.adapter.subscribeSensors((reading) => this.persistReading(reading));
      this.initialized = true;
    }
    this.adapter.start();
  }

  stop() {
    this.adapter.stop();
  }

  getState() {
    this.start();
    return {
      mode: "simulator" as const,
      connection: this.adapter.getConnectionStatus(),
      simulator: this.adapter.getStatus(),
      sensors: this.adapter.getSensors(),
      readings: this.adapter.getLatestReadings(),
      devices: this.adapter.getDevices(),
    };
  }

  applyScenario(scenario: SimulatorScenario) {
    this.start();
    this.adapter.applyScenario(scenario);
    this.persistEvent({
      eventId: crypto.randomUUID(), type: "simulator.scenario", sourceType: "simulator",
      sourceId: scenario, payload: { scenario }, occurredAt: new Date().toISOString(),
    });
    return this.getState();
  }

  injectReading(sensorId: string, value: number | boolean) {
    this.start();
    return this.adapter.injectReading(sensorId, value);
  }

  async executeCommand(command: DeviceCommand) {
    this.start();
    const validCommand = deviceCommandSchema.parse(command);
    const result = await this.adapter.executeCommand(validCommand);
    const now = new Date().toISOString();
    if (result.success) {
      getDb().update(devices).set({ stateJson: JSON.stringify(result.state), updatedAt: now }).where(eq(devices.id, result.deviceId)).run();
    }
    this.persistEvent({
      eventId: crypto.randomUUID(), type: result.success ? "device.command.succeeded" : "device.command.failed",
      sourceType: "device", sourceId: command.deviceId, payload: { command, result }, occurredAt: now,
    });
    return result;
  }

  getEvents(limit = 50) {
    return getDb().select().from(events).orderBy(desc(events.occurredAt)).limit(Math.min(Math.max(limit, 1), 200)).all().map((event) => ({
      ...event,
      payload: JSON.parse(event.payloadJson) as unknown,
    }));
  }

  private persistReading(reading: SensorReading) {
    const db = getDb();
    db.insert(sensorReadings).values({
      eventId: reading.eventId, sensorId: reading.sensorId, valueJson: JSON.stringify(reading.value),
      measuredAt: reading.measuredAt, source: reading.source,
    }).run();
    this.persistEvent({
      eventId: reading.eventId, type: "sensor.reading", sourceType: "sensor",
      sourceId: reading.sensorId, payload: reading, occurredAt: reading.measuredAt,
    });
  }

  private persistEvent(event: { eventId: string; type: string; sourceType: string; sourceId: string; payload: unknown; occurredAt: string }) {
    getDb().insert(events).values({
      eventId: event.eventId, type: event.type, sourceType: event.sourceType,
      sourceId: event.sourceId, payloadJson: JSON.stringify(event.payload), occurredAt: event.occurredAt,
    }).run();
  }
}

const globalRuntime = globalThis as typeof globalThis & { physicalWorkspaceRuntime?: WorkspaceRuntime };

export function getWorkspaceRuntime() {
  globalRuntime.physicalWorkspaceRuntime ??= new WorkspaceRuntime();
  return globalRuntime.physicalWorkspaceRuntime;
}
