import { Injectable, Logger } from "@nestjs/common";
import { config } from "../config.js";
import type { TelemetryEvent } from "../contracts/telemetry.js";
import { AgentResultPublisher } from "../agent-result/agent-result-publisher.js";
import { buildTelemetryDecisionResult } from "../agent-result/telemetry-decision.js";
import { PostgresService } from "../persistence/postgres-service.js";

@Injectable()
export class MastraDecisionService {
  private readonly logger = new Logger(MastraDecisionService.name);

  constructor(
    private readonly postgres: PostgresService,
    private readonly agentResults: AgentResultPublisher,
  ) {}

  shouldRunForTelemetry(event: TelemetryEvent) {
    return this.findTrigger(event) !== undefined;
  }

  async runForTelemetry(event: TelemetryEvent) {
    const trigger = this.findTrigger(event);
    if (!trigger) return;

    const decision = buildTelemetryDecisionResult(event, trigger);
    await this.postgres.insertAuditEvent({
      auditId: decision.resultId,
      type: "mastra.telemetry.decision",
      occurredAt: decision.createdAt,
      payload: decision,
      correlationId: decision.correlationId,
    });
    await this.agentResults.publish(decision);
    this.logger.log(`Mastra telemetry decision recorded and published eventId=${event.eventId} trigger=${trigger}`);
  }

  private findTrigger(event: TelemetryEvent) {
    if (config.mastraTelemetryMode === "disabled") return undefined;
    if (event.payload.kind === "temperature" && typeof event.payload.value === "number" && event.payload.value >= config.mastraTemperatureThreshold) {
      return "temperature-threshold";
    }
    if (event.payload.kind === "distance" && typeof event.payload.value === "number" && event.payload.value <= config.mastraDistanceThreshold) {
      return "distance-threshold";
    }
    if (event.payload.kind === "button" && event.payload.value === true) {
      return "button-pressed";
    }
    return undefined;
  }

}
