import "server-only";

import { deviceCommandSchema, sensorReadingSchema } from "@/domain/physical";
import { ruleActionSchema, ruleConditionSchema } from "@/domain/rule";
import { getEventStore, type WorkspaceEvent } from "@/lib/stores";
import { InputValidationError } from "@/lib/server/validation";

export type EvidenceSupport = "proven" | "derived" | "insufficient";
export type TraceCompleteness = "complete" | "partial" | "insufficient";

export type TraceEvidence = {
  id: string;
  label: string;
  support: EvidenceSupport;
  eventId?: string;
  eventType?: string;
  detail: string;
};

export type CausalTrace = {
  eventId: string;
  explainable: boolean;
  completeness: TraceCompleteness;
  title: string;
  summary: string;
  selectedEvent?: WorkspaceEvent;
  triggerReading?: unknown;
  matchedRule?: {
    ruleId: string;
    condition: unknown;
    action: unknown;
  };
  ruleEvent?: WorkspaceEvent;
  deviceExecution?: WorkspaceEvent;
  resultingState?: unknown;
  missing: string[];
  evidence: TraceEvidence[];
  causalSteps: Array<{ type: "sensor" | "rule" | "execution"; label: string; detail: string; evidenceId?: string; support: EvidenceSupport }>;
};

const supportedActionEvents = new Set(["device.command.succeeded", "device.command.failed"]);

function getPayloadObject(event: WorkspaceEvent | undefined) {
  return event?.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
}

function formatValue(value: unknown, unit?: unknown) {
  if (typeof value === "boolean") return value ? "pressed" : "released";
  const suffix = unit === "celsius" ? "°C" : unit === "lux" ? " lux" : unit === "centimeter" ? " cm" : "";
  return `${String(value)}${suffix}`;
}

function formatCondition(condition: { sensorId: string; operator: string; value: unknown; unit: string }) {
  const operators: Record<string, string> = { gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "=" };
  return `${condition.sensorId} ${operators[condition.operator] ?? condition.operator} ${formatValue(condition.value, condition.unit)}`;
}

function conditionSatisfied(reading: { value: number | boolean; unit: string }, condition: { operator: string; value: number | boolean; unit: string }) {
  if (reading.unit !== condition.unit) return false;
  if (condition.operator === "eq") return reading.value === condition.value;
  if (typeof reading.value !== "number" || typeof condition.value !== "number") return false;
  if (condition.operator === "gt") return reading.value > condition.value;
  if (condition.operator === "gte") return reading.value >= condition.value;
  if (condition.operator === "lt") return reading.value < condition.value;
  return reading.value <= condition.value;
}

function buildInsufficientTrace(eventId: string, selectedEvent?: WorkspaceEvent, reason = "The selected event is not explainable.") {
  return {
    eventId,
    explainable: false,
    completeness: "insufficient" as const,
    title: "This event cannot be explained",
    summary: reason,
    selectedEvent,
    missing: ["explainable action event"],
    evidence: [],
    causalSteps: [],
  };
}

export async function buildCausalTrace(eventId: string): Promise<CausalTrace> {
  const eventStore = getEventStore();
  const selectedEvent = await eventStore.getEventByEventId(eventId);
  if (!selectedEvent) throw new InputValidationError(`Unknown event: ${eventId}`);

  if (!supportedActionEvents.has(selectedEvent.type)) return buildInsufficientTrace(eventId, selectedEvent);

  const selectedPayload = getPayloadObject(selectedEvent);
  const commandResult = getPayloadObject(selectedPayload.result && typeof selectedPayload.result === "object" ? { ...selectedEvent, payload: selectedPayload.result } : undefined);
  const parsedCommand = deviceCommandSchema.safeParse(selectedPayload.command);
  if (!parsedCommand.success) return buildInsufficientTrace(eventId, selectedEvent, "The selected action event does not include a valid device command payload.");

  const command = parsedCommand.data;
  const allRows = await eventStore.listEventsAscending(200);
  const causation = command.causation;
  const ruleEvent = causation
    ? allRows.find((event) => event.eventId === causation.ruleEventId)
    : [...allRows].reverse().find((event) => {
        const payload = getPayloadObject(event);
        const action = ruleActionSchema.safeParse(payload.action);
        return event.type === "rule.matched" && action.success && action.data.deviceId === command.deviceId && action.data.command === command.command && event.id < selectedEvent.id;
      });

  const rulePayload = getPayloadObject(ruleEvent);
  const parsedCondition = ruleConditionSchema.safeParse(rulePayload.condition);
  const parsedAction = ruleActionSchema.safeParse(rulePayload.action);
  const parsedReading = sensorReadingSchema.safeParse(rulePayload.reading);

  const missing: string[] = [];
  const evidence: TraceEvidence[] = [{
    id: "device-execution",
    label: "Device command event",
    support: "proven",
    eventId: selectedEvent.eventId,
    eventType: selectedEvent.type,
    detail: `${command.deviceId} received ${command.command}`,
  }];

  if (!ruleEvent || !parsedCondition.success || !parsedAction.success) {
    missing.push("matched rule");
  } else {
    evidence.push({
      id: "matched-rule",
      label: "Matched rule event",
      support: causation ? "proven" : "derived",
      eventId: ruleEvent.eventId,
      eventType: ruleEvent.type,
      detail: `${String(rulePayload.ruleId ?? ruleEvent.sourceId)} configured ${parsedAction.data.deviceId} ${parsedAction.data.command}`,
    });
  }

  if (!parsedReading.success) {
    missing.push("trigger sensor reading");
  } else {
    evidence.push({
      id: "trigger-reading",
      label: "Trigger sensor reading",
      support: causation ? "proven" : "derived",
      eventId: parsedReading.data.eventId,
      eventType: "sensor.reading",
      detail: `${parsedReading.data.sensorId} reported ${formatValue(parsedReading.data.value, parsedReading.data.unit)}`,
    });
  }

  const complete = missing.length === 0;
  const title = `Why did ${command.deviceId} ${command.command}?`;
  const summary = complete && parsedCondition.success && parsedAction.success && parsedReading.success
    ? `${command.deviceId} received ${command.command} because ${parsedReading.data.sensorId} reported ${formatValue(parsedReading.data.value, parsedReading.data.unit)}, which ${conditionSatisfied(parsedReading.data, parsedCondition.data) ? "satisfied" : "was evaluated against"} the rule condition ${formatCondition(parsedCondition.data)}. The event history records the resulting device command.`
    : `This explanation is partial. The selected device command was found, but ${missing.join(" and ")} could not be proven from the recorded event history.`;

  return {
    eventId,
    explainable: true,
    completeness: complete ? "complete" : "partial",
    title,
    summary,
    selectedEvent,
    triggerReading: parsedReading.success ? parsedReading.data : undefined,
    matchedRule: ruleEvent && parsedCondition.success && parsedAction.success ? {
      ruleId: String(rulePayload.ruleId ?? ruleEvent.sourceId),
      condition: parsedCondition.data,
      action: parsedAction.data,
    } : undefined,
    ruleEvent,
    deviceExecution: selectedEvent,
    resultingState: commandResult.state,
    missing,
    evidence,
    causalSteps: [
      ...(parsedReading.success ? [{ type: "sensor" as const, label: parsedReading.data.sensorId, detail: formatValue(parsedReading.data.value, parsedReading.data.unit), evidenceId: "trigger-reading", support: causation ? "proven" as const : "derived" as const }] : []),
      ...(ruleEvent && parsedCondition.success ? [{ type: "rule" as const, label: String(rulePayload.ruleId ?? ruleEvent.sourceId), detail: formatCondition(parsedCondition.data), evidenceId: "matched-rule", support: causation ? "proven" as const : "derived" as const }] : []),
      { type: "execution", label: command.deviceId, detail: command.command, evidenceId: "device-execution", support: "proven" },
    ],
  };
}
