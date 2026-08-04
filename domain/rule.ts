import { z } from "zod";
import { deviceCommandNameSchema, sensorUnitSchema } from "@/domain/physical";

export const ruleOperatorSchema = z.enum(["gt", "gte", "lt", "lte", "eq"]);

export const ruleConditionSchema = z.object({
  sensorId: z.string().min(1),
  operator: ruleOperatorSchema,
  value: z.union([z.number(), z.boolean()]),
  unit: sensorUnitSchema,
});

export const ruleActionSchema = z.object({
  deviceId: z.string().min(1),
  command: deviceCommandNameSchema,
  value: z.number().optional(),
});

export const ruleInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(""),
  condition: ruleConditionSchema,
  action: ruleActionSchema,
  enabled: z.boolean().default(true),
  cooldownSeconds: z.number().int().min(0).max(86_400).default(10),
});

export const rulePatchSchema = ruleInputSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export type RuleOperator = z.infer<typeof ruleOperatorSchema>;
export type RuleInput = z.infer<typeof ruleInputSchema>;
export type RuleRecord = RuleInput & {
  id: string;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
};
