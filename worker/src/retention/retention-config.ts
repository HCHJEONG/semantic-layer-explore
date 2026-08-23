export type RetentionConfig = {
  readingRetentionDays: number;
  auditEventRetentionDays: number;
  cleanupIntervalMs: number;
  batchSize: number;
};

export function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function retentionConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RetentionConfig {
  return {
    readingRetentionDays: positiveInteger(env.READING_RETENTION_DAYS, 1),
    auditEventRetentionDays: positiveInteger(env.AUDIT_EVENT_RETENTION_DAYS, 7),
    cleanupIntervalMs: positiveInteger(env.RETENTION_CLEANUP_INTERVAL_MS, 3_600_000),
    batchSize: positiveInteger(env.RETENTION_BATCH_SIZE, 5_000),
  };
}
