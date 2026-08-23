import type { TelemetryEvent } from "../contracts/telemetry.js";

export type RuleCondition = { operator: string; value: unknown; unit: string };
export type RuleAction = { deviceId: string; command: string; value?: number };

export function matchesCondition(condition: RuleCondition, event: TelemetryEvent) {
  if (condition.unit !== event.payload.unit) return false;
  const actual = event.payload.value;
  const expected = condition.value;
  if (condition.operator === "eq") return actual === expected;
  if (typeof actual !== "number" || typeof expected !== "number") return false;
  if (condition.operator === "gt") return actual > expected;
  if (condition.operator === "gte") return actual >= expected;
  if (condition.operator === "lt") return actual < expected;
  return condition.operator === "lte" && actual <= expected;
}

export function applyAction(deviceType: string, current: Record<string, unknown>, action: RuleAction, triggeredAt: string) {
  const commands: Record<string, string[]> = {
    led: ["on", "off"], relay: ["on", "off"], servo: ["set-angle", "off"], buzzer: ["beep", "off"],
  };
  if (!commands[deviceType]?.includes(action.command)) throw new Error(`${action.command} is not allowed for ${deviceType}`);
  if (action.command === "set-angle" && (action.value === undefined || action.value < 0 || action.value > 180)) {
    throw new Error("Servo angle must be between 0 and 180");
  }
  const state = { ...current, lastCommandAt: triggeredAt };
  if (action.command === "set-angle") return { ...state, status: "on", angle: action.value };
  if (action.command === "beep") return { ...state, status: "off" };
  return { ...state, status: action.command };
}
