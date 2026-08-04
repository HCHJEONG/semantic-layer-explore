import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/db";

const DAY_MS = 86_400_000;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getRetentionConfiguration() {
  return {
    readingDays: positiveInteger(process.env.READING_RETENTION_DAYS, 7),
    auditEventDays: positiveInteger(process.env.AUDIT_EVENT_RETENTION_DAYS, 30),
    cleanupIntervalMs: Math.max(60_000, positiveInteger(process.env.RETENTION_CLEANUP_INTERVAL_MS, 3_600_000)),
    batchSize: Math.min(50_000, positiveInteger(process.env.RETENTION_BATCH_SIZE, 5_000)),
  };
}

async function deleteInBatches(statement: (batchSize: number) => ReturnType<typeof sql>, batchSize: number) {
  let deleted = 0;
  while (true) {
    const result = getDb().run(statement(batchSize));
    deleted += result.changes;
    if (result.changes < batchSize) return deleted;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

export async function runRetentionCleanup(now = new Date()) {
  const config = getRetentionConfiguration();
  const readingCutoff = new Date(now.getTime() - config.readingDays * DAY_MS).toISOString();
  const auditCutoff = new Date(now.getTime() - config.auditEventDays * DAY_MS).toISOString();

  const sensorReadings = await deleteInBatches((batchSize) => sql`
    delete from sensor_readings where id in (
      select id from sensor_readings where measured_at < ${readingCutoff} order by measured_at limit ${batchSize}
    )
  `, config.batchSize);
  const readingEvents = await deleteInBatches((batchSize) => sql`
    delete from events where id in (
      select id from events where type = 'sensor.reading' and occurred_at < ${readingCutoff} order by occurred_at limit ${batchSize}
    )
  `, config.batchSize);
  const auditEvents = await deleteInBatches((batchSize) => sql`
    delete from events where id in (
      select id from events where type <> 'sensor.reading' and occurred_at < ${auditCutoff} order by occurred_at limit ${batchSize}
    )
  `, config.batchSize);

  return { sensorReadings, readingEvents, auditEvents, readingCutoff, auditCutoff };
}

const globalRetention = globalThis as typeof globalThis & {
  retentionTimer?: NodeJS.Timeout;
  retentionRunning?: boolean;
};

export function startRetentionScheduler() {
  if (globalRetention.retentionTimer) return;

  const run = async () => {
    if (globalRetention.retentionRunning) return;
    globalRetention.retentionRunning = true;
    try {
      await runRetentionCleanup();
    } catch (error) {
      console.error("Retention cleanup failed", error);
    } finally {
      globalRetention.retentionRunning = false;
    }
  };

  void run();
  globalRetention.retentionTimer = setInterval(() => void run(), getRetentionConfiguration().cleanupIntervalMs);
  globalRetention.retentionTimer.unref();
}
