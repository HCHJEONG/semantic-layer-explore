import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { devices, sensorReadings } from "@/db/schema";
import type { DeviceState, SensorReading } from "@/domain/physical";

export type PhysicalStore = {
  insertSensorReading(reading: SensorReading): Promise<void>;
  updateDeviceState(deviceId: string, state: DeviceState, updatedAt: string): Promise<void>;
};

export function getPhysicalStore(): PhysicalStore {
  return {
    async insertSensorReading(reading) {
      getDb().insert(sensorReadings).values({
        eventId: reading.eventId,
        sensorId: reading.sensorId,
        valueJson: JSON.stringify(reading.value),
        measuredAt: reading.measuredAt,
        source: reading.source,
      }).run();
    },
    async updateDeviceState(deviceId, state, updatedAt) {
      getDb().update(devices).set({ stateJson: JSON.stringify(state), updatedAt }).where(eq(devices.id, deviceId)).run();
    },
  };
}
