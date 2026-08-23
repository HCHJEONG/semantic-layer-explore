import { Injectable, Logger } from "@nestjs/common";
import type { TelemetryEvent } from "../contracts/telemetry.js";
import { AuditService } from "../audit/audit-service.js";
import { MastraDecisionService } from "../mastra/mastra-decision-service.js";
import { PostgresService } from "../persistence/postgres-service.js";

type KafkaPosition = { topic: string; partition: number; offset: string };

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    private readonly postgres: PostgresService,
    private readonly audit: AuditService,
    private readonly mastra: MastraDecisionService,
  ) {}

  async handle(event: TelemetryEvent, position: KafkaPosition) {
    const result = await this.postgres.insertTelemetry(event, position);
    if (result.duplicate) {
      this.logger.warn(`duplicate telemetry skipped: ${event.eventId}`);
      return;
    }

    await this.audit.recordTelemetryAccepted(event);
    if (this.mastra.shouldRunForTelemetry(event)) {
      try {
        await this.mastra.runForTelemetry(event);
      } catch (error) {
        await this.audit.recordMastraDecisionFailed(event, error);
        this.logger.warn(`Mastra telemetry decision failed for eventId=${event.eventId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}
