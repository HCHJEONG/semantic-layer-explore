import "server-only";

import { ruleInputSchema, type RuleInput, type RuleRecord } from "@/domain/rule";
import { getRuleStore } from "@/lib/stores";
import { InputValidationError } from "@/lib/validation";

let enabledRuleCache: RuleRecord[] | null = null;

function invalidateEnabledRuleCache() {
  enabledRuleCache = null;
}

export async function listRules() {
  return getRuleStore().listRules();
}

export async function getRule(id: string) {
  return getRuleStore().getRule(id);
}

export async function listEnabledRules() {
  enabledRuleCache ??= await getRuleStore().listEnabledRules();
  return enabledRuleCache;
}

export async function validateRuleTargets(input: RuleInput) {
  const [sensor, device] = await Promise.all([
    getRuleStore().getSensor(input.condition.sensorId),
    getRuleStore().getDevice(input.action.deviceId),
  ]);
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

export async function createRule(value: unknown) {
  const input = ruleInputSchema.parse(value);
  await validateRuleTargets(input);
  const now = new Date().toISOString();
  const rule = await getRuleStore().createRule({ id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now });
  invalidateEnabledRuleCache();
  return rule;
}

export async function updateRule(id: string, patch: Partial<RuleInput>) {
  const current = await getRule(id);
  if (!current) return null;
  const input = ruleInputSchema.parse({ ...current, ...patch });
  await validateRuleTargets(input);
  const rule = await getRuleStore().updateRule(id, input, new Date().toISOString());
  invalidateEnabledRuleCache();
  return rule;
}

export async function setRuleEnabled(id: string, enabled: boolean) {
  const rule = await getRuleStore().setRuleEnabled(id, enabled, new Date().toISOString());
  invalidateEnabledRuleCache();
  return rule;
}

export async function markRuleTriggered(id: string, triggeredAt: string) {
  await getRuleStore().markRuleTriggered(id, triggeredAt);
  const cachedRule = enabledRuleCache?.find((rule) => rule.id === id);
  if (cachedRule) {
    cachedRule.lastTriggeredAt = triggeredAt;
    cachedRule.updatedAt = triggeredAt;
  }
}

export async function deleteRule(id: string) {
  const deleted = await getRuleStore().deleteRule(id);
  if (deleted) invalidateEnabledRuleCache();
  return deleted;
}
