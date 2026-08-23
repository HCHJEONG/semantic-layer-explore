import { Injectable, OnModuleDestroy } from "@nestjs/common";
import pg from "pg";
import { config } from "../config.js";
import type { TelemetryEvent } from "../contracts/telemetry.js";

const { Pool } = pg;

@Injectable()
export class PostgresService implements OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: config.databaseUrl, max: 4 });

  async insertTelemetry(event: TelemetryEvent, position: { topic: string; partition: number; offset: string }) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query(
        `insert into telemetry_event
          (event_id, device_id, sensor_id, sequence, measured_at, source, payload, kafka_topic, kafka_partition, kafka_offset)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
         on conflict (event_id) do nothing`,
        [
          event.eventId,
          event.deviceId,
          event.sensorId,
          event.sequence,
          event.measuredAt,
          event.source ?? "mqtt",
          JSON.stringify(event.payload),
          position.topic,
          position.partition,
          position.offset,
        ],
      );
      await client.query("commit");
      return { duplicate: result.rowCount === 0 };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
