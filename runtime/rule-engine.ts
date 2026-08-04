import type { SensorReading } from "@/domain/physical";
import type { RuleOperator, RuleRecord } from "@/domain/rule";

export type RuleEvaluation = { matched: boolean; reason: "sensor-mismatch" | "unit-mismatch" | "cooldown" | "condition-false" | "matched" };

function compare(actual: number | boolean, operator: RuleOperator, expected: number | boolean) {
  if (operator === "eq") return actual === expected;
  if (typeof actual !== "number" || typeof expected !== "number") return false;
  if (operator === "gt") return actual > expected;
  if (operator === "gte") return actual >= expected;
  if (operator === "lt") return actual < expected;
  return actual <= expected;
}

export function evaluateRule(rule: RuleRecord, reading: SensorReading, now = Date.now()): RuleEvaluation {
  if (rule.condition.sensorId !== reading.sensorId) return { matched: false, reason: "sensor-mismatch" };
  if (rule.condition.unit !== reading.unit) return { matched: false, reason: "unit-mismatch" };
  if (rule.lastTriggeredAt) {
    const elapsedMs = now - Date.parse(rule.lastTriggeredAt);
    if (elapsedMs < rule.cooldownSeconds * 1000) return { matched: false, reason: "cooldown" };
  }
  return compare(reading.value, rule.condition.operator, rule.condition.value)
    ? { matched: true, reason: "matched" }
    : { matched: false, reason: "condition-false" };
}
