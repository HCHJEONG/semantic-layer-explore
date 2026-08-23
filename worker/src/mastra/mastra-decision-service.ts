import { Injectable, Logger } from "@nestjs/common";
import type { TelemetryEvent } from "../contracts/telemetry.js";

@Injectable()
export class MastraDecisionService {
  private readonly logger = new Logger(MastraDecisionService.name);

  shouldRunForTelemetry(event: TelemetryEvent) {
    return event.payload.kind === "temperature" && typeof event.payload.value === "number" && event.payload.value >= 32;
  }

  async runForTelemetry(event: TelemetryEvent) {
    this.logger.log(`Mastra placeholder skipped live LLM for eventId=${event.eventId}`);
  }
}
