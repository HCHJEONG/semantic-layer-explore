import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import type { TelemetryEvent } from "../contracts/telemetry.js";
import type { AgentResult } from "./agent-result-publisher.js";

export type TelemetryDecisionResult = AgentResult & {
  kind: "impact-analysis";
  status: "succeeded" | "skipped";
  summary: string;
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

export function buildTelemetryDecisionResult(event: TelemetryEvent, trigger: string): TelemetryDecisionResult {
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
