import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { TelemetryEvent } from "../contracts/telemetry.js";
import { PostgresService } from "../persistence/postgres-service.js";

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly postgres: PostgresService) {}

  async recordTelemetryAccepted(event: TelemetryEvent) {
    this.logger.log(`telemetry accepted eventId=${event.eventId} deviceId=${event.deviceId}`);
  }

  async recordMastraDecisionFailed(event: TelemetryEvent, error: unknown) {
    await this.postgres.insertAuditEvent({
      auditId: randomUUID(),
      type: "mastra.telemetry.failed",
      occurredAt: new Date().toISOString(),
      correlationId: event.correlationId,
      payload: {
        schemaVersion: "audit-event.v1",
        eventId: event.eventId,
        deviceId: event.deviceId,
        sensorId: event.sensorId,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
