import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import type { TelemetryEvent } from "../contracts/telemetry.js";
import { AgentResultPublisher, type AgentResult } from "../agent-result/agent-result-publisher.js";
import { PostgresService } from "../persistence/postgres-service.js";

type MastraDecision = AgentResult & {
  payload: {
    mode: string;
    trigger: string;
    event: {
      eventId: string;
      deviceId: string;
      sensorId: string;
      kind: string;
      value: number | boolean;
      unit: string;
      measuredAt: string;
    };
    workflow: {
      engine: "mastra-boundary";
      stages: Array<{ id: string; label: string; status: "completed" }>;
    };
    llmInvoked: false;
  };
};

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

    const decision = this.buildDecision(event, trigger);
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

  private buildDecision(event: TelemetryEvent, trigger: string): MastraDecision {
    const createdAt = new Date().toISOString();
    const status = config.mastraTelemetryMode === "dry-run" ? "skipped" : "succeeded";
    return {
      schemaVersion: "agent-result.v1",
      resultId: randomUUID(),
      kind: "impact-analysis",
      status,
      summary: `Telemetry event ${event.eventId} matched ${trigger}; live LLM invocation is ${config.mastraTelemetryMode}.`,
      payload: {
        mode: config.mastraTelemetryMode,
        trigger,
        event: {
          eventId: event.eventId,
          deviceId: event.deviceId,
          sensorId: event.sensorId,
          kind: event.payload.kind,
          value: event.payload.value,
          unit: event.payload.unit,
          measuredAt: event.measuredAt,
        },
        workflow: {
          engine: "mastra-boundary",
          stages: [
            { id: "trigger-classification", label: "Classify telemetry trigger", status: "completed" },
            { id: "policy-gate", label: "Apply conditional AI invocation gate", status: "completed" },
            { id: "audit-result", label: "Record agent result audit", status: "completed" },
          ],
        },
        llmInvoked: false,
      },
      createdAt,
      correlationId: event.correlationId ?? randomUUID(),
    };
  }
}
