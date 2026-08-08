import type { PhysicalWorkspaceAdapter } from "@/adapters/physical-workspace-adapter";
import type { ConnectionStatus, DeviceCommand, DeviceCommandResult, DeviceDefinition, DeviceState, SensorDefinition, SensorReading, SimulatorScenario } from "@/domain/physical";

const sensors: SensorDefinition[] = [
  { id: "temperature-01", name: "Temperature Sensor", type: "temperature", unit: "celsius" },
  { id: "light-01", name: "Light Sensor", type: "light", unit: "lux" },
  { id: "distance-01", name: "Distance Sensor", type: "distance", unit: "centimeter" },
  { id: "button-01", name: "Button Sensor", type: "button", unit: "boolean" },
];

const deviceDefinitions: DeviceDefinition[] = [
  { id: "led-01", name: "Workspace LED", type: "led" },
  { id: "servo-01", name: "Workspace Servo", type: "servo" },
  { id: "buzzer-01", name: "Workspace Buzzer", type: "buzzer" },
  { id: "relay-fan-01", name: "Fan Relay", type: "relay" },
];

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export class SimulatorAdapter implements PhysicalWorkspaceAdapter {
  private readonly random: () => number;
  private readonly intervalMs: number;
  private readonly listeners = new Set<(reading: SensorReading) => void>();
  private readonly latest = new Map<string, SensorReading>();
  private readonly deviceStates = new Map<string, DeviceState>();
  private timer?: NodeJS.Timeout;
  private connectedAt = new Date().toISOString();
  private connected = false;
  private activeScenario: SimulatorScenario = "normal";
  private disconnectedSensors = new Set<string>();

  constructor(options: { seed: number; intervalMs: number }) {
    this.random = seededRandom(options.seed);
    this.intervalMs = options.intervalMs;
    for (const device of deviceDefinitions) {
      this.deviceStates.set(device.id, device.type === "servo" ? { status: "off", angle: 90 } : { status: "off" });
    }
  }

  async connect() {
    if (this.connected) return;
    this.connected = true;
    this.connectedAt = new Date().toISOString();
    this.emitCycle();
  }

  async disconnect() {
    this.stop();
    this.connected = false;
  }

  start() {
    if (this.timer) return;
    void this.connect();
    this.timer = setInterval(() => this.emitCycle(), this.intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  isRunning() {
    return Boolean(this.timer);
  }

  subscribeSensors(listener: (reading: SensorReading) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getConnectionStatus(): ConnectionStatus {
    return { state: this.connected ? "connected" : "disconnected", adapter: "simulator", since: this.connectedAt };
  }

  getSensors() {
    return sensors.map((sensor) => ({ ...sensor }));
  }

  getDevices() {
    return deviceDefinitions.map((device) => ({ ...device, state: { ...(this.deviceStates.get(device.id) ?? { status: "off" as const }) } }));
  }

  getLatestReadings() {
    return sensors.map((sensor) => this.latest.get(sensor.id)).filter((item): item is SensorReading => Boolean(item));
  }

  getStatus() {
    return { running: this.isRunning(), scenario: this.activeScenario, intervalMs: this.intervalMs, connection: this.getConnectionStatus() };
  }

  applyScenario(scenario: SimulatorScenario) {
    this.activeScenario = scenario;
    this.disconnectedSensors.clear();
    if (scenario === "sensor-disconnected") {
      this.disconnectedSensors.add("temperature-01");
      return;
    }
    const values: Partial<Record<string, number | boolean>> = {
      ...(scenario === "high-temperature" ? { "temperature-01": 31.5 } : {}),
      ...(scenario === "dark-room" ? { "light-01": 60 } : {}),
      ...(scenario === "object-approaching" ? { "distance-01": 8 } : {}),
      ...(scenario === "button-pressed" ? { "button-01": true } : {}),
    };
    for (const [sensorId, value] of Object.entries(values)) {
      if (value !== undefined) this.injectReading(sensorId, value);
    }
    if (scenario === "button-pressed") this.activeScenario = "normal";
  }

  injectReading(sensorId: string, value: number | boolean) {
    const sensor = sensors.find((item) => item.id === sensorId);
    if (!sensor) throw new Error(`Unknown sensor: ${sensorId}`);
    if (sensor.type === "button" && typeof value !== "boolean") throw new Error("Button readings must be boolean.");
    if (sensor.type !== "button" && typeof value !== "number") throw new Error(`${sensor.type} readings must be numeric.`);
    this.disconnectedSensors.delete(sensorId);
    return this.emit(sensor, value);
  }

  async executeCommand(command: DeviceCommand): Promise<DeviceCommandResult> {
    const device = deviceDefinitions.find((item) => item.id === command.deviceId);
    if (!device || device.type !== command.deviceType) return { success: false, deviceId: command.deviceId, state: { status: "off" }, error: "Unknown device." };
    if (command.command === "set-angle") {
      if (device.type !== "servo" || command.value === undefined || command.value < 0 || command.value > 180) {
        return { success: false, deviceId: command.deviceId, state: this.deviceStates.get(command.deviceId) ?? { status: "off" }, error: "Servo angle must be between 0 and 180." };
      }
      this.deviceStates.set(device.id, { status: "on", angle: command.value, lastCommandAt: command.issuedAt });
    } else if (command.command === "beep") {
      if (device.type !== "buzzer") return { success: false, deviceId: command.deviceId, state: this.deviceStates.get(command.deviceId) ?? { status: "off" }, error: "Only a buzzer can beep." };
      this.deviceStates.set(device.id, { status: "off", lastCommandAt: command.issuedAt });
    } else {
      this.deviceStates.set(device.id, { ...(this.deviceStates.get(device.id) ?? {}), status: command.command, lastCommandAt: command.issuedAt });
    }
    return { success: true, deviceId: device.id, state: { ...this.deviceStates.get(device.id)! } };
  }

  private emitCycle() {
    const previous = (sensorId: string, fallback: number) => {
      const value = this.latest.get(sensorId)?.value;
      return typeof value === "number" ? value : fallback;
    };
    const nextValues: Record<string, number | boolean> = {
      "temperature-01": Number(clamp(previous("temperature-01", 24) + (this.random() - 0.5) * 0.7, 20, 35).toFixed(1)),
      "light-01": Math.round(clamp(previous("light-01", 550) + (this.random() - 0.5) * 50, 20, 1000)),
      "distance-01": Number(clamp(previous("distance-01", 120) + (this.random() - 0.5) * 12, 5, 200).toFixed(1)),
      "button-01": this.random() < 0.03,
    };
    for (const sensor of sensors) {
      if (!this.disconnectedSensors.has(sensor.id)) this.emit(sensor, nextValues[sensor.id]);
    }
  }

  private emit(sensor: SensorDefinition, value: number | boolean) {
    const reading: SensorReading = {
      eventId: crypto.randomUUID(), sensorId: sensor.id, sensorType: sensor.type,
      value, unit: sensor.unit, measuredAt: new Date().toISOString(), source: "simulator",
    };
    this.latest.set(sensor.id, reading);
    for (const listener of this.listeners) listener(reading);
    return reading;
  }
}
