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

  async insertDeadLetter(event: {
    deadLetterId: string;
    sourceTopic: string;
    sourcePartition: number;
    sourceOffset: string;
    key?: string;
    reason: string;
    errorMessage: string;
    payload?: string;
    payloadJson?: unknown;
    failedAt: string;
  }) {
    const result = await this.pool.query(
      `insert into dead_letter_event
        (dead_letter_id, source_topic, source_partition, source_offset, key, reason, error_message, payload, payload_json, failed_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
       on conflict (source_topic, source_partition, source_offset) do nothing`,
      [
        event.deadLetterId,
        event.sourceTopic,
        event.sourcePartition,
        event.sourceOffset,
        event.key ?? null,
        event.reason,
        event.errorMessage,
        event.payload ?? null,
        event.payloadJson === undefined ? null : JSON.stringify(event.payloadJson),
        event.failedAt,
      ],
    );
    return { duplicate: result.rowCount === 0 };
  }

  async insertAuditEvent(event: {
    auditId: string;
    type: string;
    occurredAt: string;
    payload: unknown;
    correlationId?: string;
  }) {
    const result = await this.pool.query(
      `insert into audit_event
        (audit_id, type, occurred_at, payload, correlation_id)
       values ($1, $2, $3, $4::jsonb, $5)
       on conflict (audit_id) do nothing`,
      [
        event.auditId,
        event.type,
        event.occurredAt,
        JSON.stringify(event.payload),
        event.correlationId ?? null,
      ],
    );
    return { duplicate: result.rowCount === 0 };
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
