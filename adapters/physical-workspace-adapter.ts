import type { ConnectionStatus, DeviceCommand, DeviceCommandResult, DeviceDefinition, DeviceState, SensorDefinition, SensorReading } from "@/domain/physical";

export interface PhysicalWorkspaceAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribeSensors(listener: (reading: SensorReading) => void): () => void;
  executeCommand(command: DeviceCommand): Promise<DeviceCommandResult>;
  getConnectionStatus(): ConnectionStatus;
  getSensors(): SensorDefinition[];
  getDevices(): Array<DeviceDefinition & { state: DeviceState }>;
  getLatestReadings(): SensorReading[];
}
