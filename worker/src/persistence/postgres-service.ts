import { Injectable, OnModuleDestroy } from "@nestjs/common";
import pg from "pg";
import { config } from "../config.js";
import type { TelemetryEvent } from "../contracts/telemetry.js";
import { applyAction, matchesCondition, type RuleAction, type RuleCondition } from "../rules/deterministic-rule.js";
import type { CommandResult } from "../contracts/command-result.js";
import type { RetentionConfig } from "../retention/retention-config.js";

const { Pool } = pg;

type RuleMatch = { ruleId: string; deviceId: string; command: string };

@Injectable()
export class PostgresService implements OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: config.databaseUrl, max: 4 });

  async insertTelemetry(event: TelemetryEvent, position: { topic: string; partition: number; offset: string }) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const dedup = await client.query(
        `insert into telemetry_event_dedup(event_id,first_processed_at)
         values($1,now()) on conflict(event_id) do nothing`,
        [event.eventId],
      );
      if (dedup.rowCount === 0) {
        await client.query("commit");
        return { duplicate: true };
      }
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
      if (result.rowCount === 1) {
        await client.query(
          `insert into workspace_event(event_id,type,source_type,source_id,payload,occurred_at)
           values($1,'sensor.reading','sensor',$2,$3::jsonb,$4) on conflict(event_id) do nothing`,
          [event.eventId, event.sensorId, JSON.stringify({ eventId: event.eventId, sensorId: event.sensorId, sensorType: event.payload.kind, value: event.payload.value, unit: event.payload.unit, measuredAt: event.measuredAt, source: event.source ?? "mqtt" }), event.measuredAt],
        );
      }
      await client.query("commit");
      return { duplicate: result.rowCount === 0 };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async cleanupRetention(retention: RetentionConfig) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const lock = await client.query<{ acquired: boolean }>("select pg_try_advisory_xact_lock($1) as acquired", [0x53454d52]);
      if (!lock.rows[0]?.acquired) {
        await client.query("rollback");
        return { acquired: false, telemetryDeleted: 0, sensorReadingsDeleted: 0, auditDeleted: 0 };
      }
      const schedule = await client.query(
        `update retention_cleanup_state set last_started_at=now()
         where name='postgres-retention'
           and (last_started_at is null or last_started_at <= now()-make_interval(secs => $1 / 1000.0))
         returning name`,
        [retention.cleanupIntervalMs],
      );
      if (schedule.rowCount !== 1) {
        await client.query("rollback");
        return { acquired: false, telemetryDeleted: 0, sensorReadingsDeleted: 0, auditDeleted: 0 };
      }

      const telemetry = await client.query(
        `delete from telemetry_event where id in (
           select id from telemetry_event
           where processed_at < now()-make_interval(days => $1)
           order by processed_at,id limit $2 for update skip locked
         )`,
        [retention.readingRetentionDays, retention.batchSize],
      );
      const sensorReadings = await client.query(
        `delete from workspace_event where id in (
           select id from workspace_event
           where type='sensor.reading' and occurred_at < now()-make_interval(days => $1)
           order by occurred_at,id limit $2 for update skip locked
         )`,
        [retention.readingRetentionDays, retention.batchSize],
      );
      const audit = await client.query(
        `delete from audit_event where id in (
           select id from audit_event
           where type<>'rule.matched' and occurred_at < now()-make_interval(days => $1)
           order by occurred_at,id limit $2 for update skip locked
         )`,
        [retention.auditEventRetentionDays, retention.batchSize],
      );
      await client.query("commit");
      return {
        acquired: true,
        telemetryDeleted: telemetry.rowCount ?? 0,
        sensorReadingsDeleted: sensorReadings.rowCount ?? 0,
        auditDeleted: audit.rowCount ?? 0,
      };
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
        applyAction(device.type, device.state, action, triggeredAt);
        const correlationId = event.correlationId ?? event.eventId;
        const ruleEventId = `rule-event:${event.eventId}:${row.id}`;
        const commandEventId = `device-command:${event.eventId}:${row.id}`;
        const command = { schemaVersion: "command.v1", commandId: commandEventId, deviceId: action.deviceId, command: action.command, ...(action.value === undefined ? {} : { value: action.value }), issuedBy: "rule-engine", issuedAt: triggeredAt, correlationId, causation: { correlationId, ruleId: row.id, ruleEventId, triggerEventId: event.eventId } };
        await client.query("update rules set last_triggered_at=$2, updated_at=$2 where id=$1", [row.id, triggeredAt]);
        await client.query(
          `insert into workspace_event(event_id,type,source_type,source_id,payload,occurred_at)
           values($1,'rule.matched','rule',$2,$3::jsonb,$4) on conflict(event_id) do nothing`,
          [ruleEventId, row.id, JSON.stringify({ ruleId: row.id, condition, action, reading: { eventId: event.eventId, sensorId: event.sensorId, sensorType: event.payload.kind, value: event.payload.value, unit: event.payload.unit, measuredAt: event.measuredAt, source: event.source ?? "mqtt" }, causation: { correlationId, triggerEventId: event.eventId } }), triggeredAt],
        );
        await client.query(
          `insert into device_command(command_id,device_id,payload,status,requested_at)
           values($1,$2,$3::jsonb,'pending',$4) on conflict(command_id) do nothing`,
          [commandEventId, action.deviceId, JSON.stringify(command), triggeredAt],
        );
        await client.query(
          `insert into workspace_event(event_id,type,source_type,source_id,payload,occurred_at)
           values($1,'device.command.pending','device',$2,$3::jsonb,$4) on conflict(event_id) do nothing`,
          [`${commandEventId}:pending`, action.deviceId, JSON.stringify({ command, status: "pending" }), triggeredAt],
        );
        await client.query(
          `insert into audit_event(audit_id,type,occurred_at,payload,correlation_id)
           values($1,'rule.matched',$2,$3::jsonb,$4) on conflict(audit_id) do nothing`,
          [auditId, triggeredAt, JSON.stringify({ ruleId: row.id, ruleName: row.name, condition, action, event, ruleEventId, commandEventId }), correlationId],
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

  async applyCommandResult(result: CommandResult) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const commandRow = await client.query("select device_id,payload,status from device_command where command_id=$1 for update", [result.commandId]);
      if (commandRow.rowCount !== 1) throw new Error(`Unknown command result: ${result.commandId}`);
      const command = commandRow.rows[0] as { device_id: string; payload: Record<string, unknown>; status: string };
      if (command.device_id !== result.deviceId) throw new Error(`Command result device mismatch: ${result.commandId}`);
      if (command.status === "succeeded" || command.status === "failed") {
        await client.query("commit");
        return { duplicate: true };
      }
      if (result.success) {
        if (!result.state) throw new Error(`Successful command result has no state: ${result.commandId}`);
        await client.query("update devices set state=$2::jsonb,updated_at=$3 where id=$1", [result.deviceId, JSON.stringify(result.state), result.occurredAt]);
      }
      const status = result.success ? "succeeded" : "failed";
      const failureCode = result.success ? null : (result.failureCode ?? "device.command.rejected");
      await client.query("update device_command set status=$2,completed_at=$3,result=$4::jsonb,last_error=$5,failure_code=$6,publish_attempts=greatest(publish_attempts,$7) where command_id=$1", [result.commandId, status, result.occurredAt, JSON.stringify({ ...result, ...(failureCode ? { failureCode } : {}) }), result.error ?? null, failureCode, result.publishAttempts ?? 0]);
      await client.query(
        `insert into workspace_event(event_id,type,source_type,source_id,payload,occurred_at)
         values($1,$2,'device',$3,$4::jsonb,$5) on conflict(event_id) do nothing`,
        [result.commandId, `device.command.${status}`, result.deviceId, JSON.stringify({ command: command.payload, result: { ...result, ...(failureCode ? { failureCode } : {}) } }), result.occurredAt],
      );
      await client.query("commit");
      return { duplicate: false };
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
