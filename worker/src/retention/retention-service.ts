import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PostgresService } from "../persistence/postgres-service.js";
import { retentionConfigFromEnv } from "./retention-config.js";

@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private readonly retention = retentionConfigFromEnv();
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly postgres: PostgresService) {}

  onModuleInit() {
    void this.runNow();
    this.timer = setInterval(() => void this.runNow(), this.retention.cleanupIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runNow() {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.postgres.cleanupRetention(this.retention);
      if (!result.acquired) return;
      this.logger.log(
        `retention cleanup completed telemetry=${result.telemetryDeleted} sensorReadings=${result.sensorReadingsDeleted} audit=${result.auditDeleted} batchSize=${this.retention.batchSize}`,
      );
    } catch (error) {
      this.logger.warn(`retention cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
