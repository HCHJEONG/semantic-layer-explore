import "server-only";

import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { devices, rules, sensors } from "@/db/schema";
import { ruleActionSchema, ruleConditionSchema, ruleInputSchema, type RuleInput, type RuleRecord } from "@/domain/rule";
import { InputValidationError } from "@/lib/validation";

type RuleRow = typeof rules.$inferSelect;

function toRuleRecord(row: RuleRow): RuleRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    condition: ruleConditionSchema.parse(JSON.parse(row.conditionJson)),
    action: ruleActionSchema.parse(JSON.parse(row.actionJson)),
    enabled: row.enabled,
    cooldownSeconds: row.cooldownSeconds,
    lastTriggeredAt: row.lastTriggeredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listRules() {
  return getDb().select().from(rules).orderBy(asc(rules.createdAt)).all().map(toRuleRecord);
}

export function getRule(id: string) {
  const row = getDb().select().from(rules).where(eq(rules.id, id)).get();
  return row ? toRuleRecord(row) : null;
}

export function listEnabledRules() {
  return getDb().select().from(rules).where(eq(rules.enabled, true)).all().map(toRuleRecord);
}

export function validateRuleTargets(input: RuleInput) {
  const db = getDb();
  const sensor = db.select().from(sensors).where(eq(sensors.id, input.condition.sensorId)).get();
  const device = db.select().from(devices).where(eq(devices.id, input.action.deviceId)).get();
  if (!sensor || !sensor.enabled) throw new InputValidationError(`Unknown or disabled sensor: ${input.condition.sensorId}`);
  if (!device || !device.enabled) throw new InputValidationError(`Unknown or disabled device: ${input.action.deviceId}`);
  if (sensor.unit !== input.condition.unit) throw new InputValidationError(`Sensor ${sensor.id} uses ${sensor.unit}, not ${input.condition.unit}.`);

  const allowedCommands: Record<string, string[]> = {
    led: ["on", "off"], relay: ["on", "off"], servo: ["set-angle", "off"], buzzer: ["beep", "off"],
  };
  if (!allowedCommands[device.type]?.includes(input.action.command)) throw new InputValidationError(`${input.action.command} is not allowed for ${device.type}.`);
  if (input.action.command === "set-angle" && (input.action.value === undefined || input.action.value < 0 || input.action.value > 180)) {
    throw new InputValidationError("Servo angle must be between 0 and 180.");
  }
}

export function createRule(value: unknown) {
  const input = ruleInputSchema.parse(value);
  validateRuleTargets(input);
  const now = new Date().toISOString();
  const row = getDb().insert(rules).values({
    id: crypto.randomUUID(), name: input.name, description: input.description,
    conditionJson: JSON.stringify(input.condition), actionJson: JSON.stringify(input.action),
    enabled: input.enabled, cooldownSeconds: input.cooldownSeconds,
    createdAt: now, updatedAt: now,
  }).returning().get();
  return toRuleRecord(row);
}

export function updateRule(id: string, patch: Partial<RuleInput>) {
  const current = getRule(id);
  if (!current) return null;
  const input = ruleInputSchema.parse({ ...current, ...patch });
  validateRuleTargets(input);
  const row = getDb().update(rules).set({
    name: input.name, description: input.description,
    conditionJson: JSON.stringify(input.condition), actionJson: JSON.stringify(input.action),
    enabled: input.enabled, cooldownSeconds: input.cooldownSeconds, updatedAt: new Date().toISOString(),
  }).where(eq(rules.id, id)).returning().get();
  return row ? toRuleRecord(row) : null;
}

export function setRuleEnabled(id: string, enabled: boolean) {
  const row = getDb().update(rules).set({ enabled, updatedAt: new Date().toISOString() }).where(eq(rules.id, id)).returning().get();
  return row ? toRuleRecord(row) : null;
}

export function markRuleTriggered(id: string, triggeredAt: string) {
  getDb().update(rules).set({ lastTriggeredAt: triggeredAt, updatedAt: triggeredAt }).where(eq(rules.id, id)).run();
}

export function deleteRule(id: string) {
  return getDb().delete(rules).where(eq(rules.id, id)).run().changes > 0;
}
