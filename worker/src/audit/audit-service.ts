import { Injectable, Logger } from "@nestjs/common";
import type { TelemetryEvent } from "../contracts/telemetry.js";

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  async recordTelemetryAccepted(event: TelemetryEvent) {
    this.logger.log(`telemetry accepted eventId=${event.eventId} deviceId=${event.deviceId}`);
  }
}
