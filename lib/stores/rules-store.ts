import "server-only";

import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { devices, rules, sensors } from "@/db/schema";
import { ruleActionSchema, ruleConditionSchema, type RuleInput, type RuleRecord } from "@/domain/rule";

type RuleRow = typeof rules.$inferSelect;
type SensorRow = typeof sensors.$inferSelect;
type DeviceRow = typeof devices.$inferSelect;

export type NewRuleRecord = RuleInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

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

function toRuleValues(input: RuleInput) {
  return {
    name: input.name,
    description: input.description,
    conditionJson: JSON.stringify(input.condition),
    actionJson: JSON.stringify(input.action),
    enabled: input.enabled,
    cooldownSeconds: input.cooldownSeconds,
  };
}

export type RuleStore = {
  listRules(): Promise<RuleRecord[]>;
  getRule(id: string): Promise<RuleRecord | null>;
  listEnabledRules(): Promise<RuleRecord[]>;
  getSensor(id: string): Promise<SensorRow | null>;
  getDevice(id: string): Promise<DeviceRow | null>;
  createRule(rule: NewRuleRecord): Promise<RuleRecord>;
  updateRule(id: string, input: RuleInput, updatedAt: string): Promise<RuleRecord | null>;
  setRuleEnabled(id: string, enabled: boolean, updatedAt: string): Promise<RuleRecord | null>;
  markRuleTriggered(id: string, triggeredAt: string): Promise<void>;
  deleteRule(id: string): Promise<boolean>;
};

export function getRuleStore(): RuleStore {
  return {
    async listRules() {
      return getDb().select().from(rules).orderBy(asc(rules.createdAt)).all().map(toRuleRecord);
    },
    async getRule(id) {
      const row = getDb().select().from(rules).where(eq(rules.id, id)).get();
      return row ? toRuleRecord(row) : null;
    },
    async listEnabledRules() {
      return getDb().select().from(rules).where(eq(rules.enabled, true)).all().map(toRuleRecord);
    },
    async getSensor(id) {
      return getDb().select().from(sensors).where(eq(sensors.id, id)).get() ?? null;
    },
    async getDevice(id) {
      return getDb().select().from(devices).where(eq(devices.id, id)).get() ?? null;
    },
    async createRule(rule) {
      const row = getDb().insert(rules).values({
        id: rule.id,
        ...toRuleValues(rule),
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      }).returning().get();
      return toRuleRecord(row);
    },
    async updateRule(id, input, updatedAt) {
      const row = getDb().update(rules).set({ ...toRuleValues(input), updatedAt }).where(eq(rules.id, id)).returning().get();
      return row ? toRuleRecord(row) : null;
    },
    async setRuleEnabled(id, enabled, updatedAt) {
      const row = getDb().update(rules).set({ enabled, updatedAt }).where(eq(rules.id, id)).returning().get();
      return row ? toRuleRecord(row) : null;
    },
    async markRuleTriggered(id, triggeredAt) {
      getDb().update(rules).set({ lastTriggeredAt: triggeredAt, updatedAt: triggeredAt }).where(eq(rules.id, id)).run();
    },
    async deleteRule(id) {
      return getDb().delete(rules).where(eq(rules.id, id)).run().changes > 0;
    },
  };
}
