import { Injectable, OnModuleDestroy } from "@nestjs/common";
import pg from "pg";
import { config } from "../config.js";
import type { TelemetryEvent } from "../contracts/telemetry.js";
import { applyAction, matchesCondition, type RuleAction, type RuleCondition } from "../rules/deterministic-rule.js";

const { Pool } = pg;

type RuleMatch = { ruleId: string; deviceId: string; command: string };

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

  async applyDeterministicRules(event: TelemetryEvent): Promise<RuleMatch[]> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const sensor = await client.query(
        "select id, type, unit from sensors where id=$1 and enabled for share",
        [event.sensorId],
      );
      if (sensor.rowCount !== 1 || sensor.rows[0].type !== event.payload.kind || sensor.rows[0].unit !== event.payload.unit) {
        throw new Error(`Unknown or incompatible sensor: ${event.sensorId}`);
      }
      const rules = await client.query(
        `select id, name, condition, action, cooldown_seconds, last_triggered_at
         from rules
         where enabled and condition->>'sensorId'=$1
         order by created_at, id
         for update`,
        [event.sensorId],
      );
      const matched: RuleMatch[] = [];
      const triggeredAt = new Date().toISOString();
      for (const row of rules.rows) {
        const auditId = `rule-match:${event.eventId}:${row.id}`;
        const alreadyApplied = await client.query("select 1 from audit_event where audit_id=$1", [auditId]);
        if (alreadyApplied.rowCount === 1) continue;
        const condition = row.condition as RuleCondition;
        const action = row.action as RuleAction;
        if (!matchesCondition(condition, event)) continue;
        if (row.last_triggered_at) {
          const elapsed = Date.parse(triggeredAt) - new Date(row.last_triggered_at).getTime();
          if (elapsed < Number(row.cooldown_seconds) * 1000) continue;
        }
        const deviceResult = await client.query("select type, state from devices where id=$1 and enabled for update", [action.deviceId]);
        if (deviceResult.rowCount !== 1) throw new Error(`Rule ${row.id} targets an unavailable device: ${action.deviceId}`);
        const device = deviceResult.rows[0] as { type: string; state: Record<string, unknown> };
        const state = applyAction(device.type, device.state, action, triggeredAt);
        await client.query("update devices set state=$2::jsonb, updated_at=$3 where id=$1", [action.deviceId, JSON.stringify(state), triggeredAt]);
        await client.query("update rules set last_triggered_at=$2, updated_at=$2 where id=$1", [row.id, triggeredAt]);
        await client.query(
          `insert into audit_event(audit_id,type,occurred_at,payload,correlation_id)
           values($1,'rule.matched',$2,$3::jsonb,$4) on conflict(audit_id) do nothing`,
          [auditId, triggeredAt, JSON.stringify({ ruleId: row.id, ruleName: row.name, condition, action, event }), event.correlationId ?? event.eventId],
        );
        matched.push({ ruleId: row.id, deviceId: action.deviceId, command: action.command });
      }
      await client.query("commit");
      return matched;
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
