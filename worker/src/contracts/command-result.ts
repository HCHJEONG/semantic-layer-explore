export type CommandResult = {
  schemaVersion: "command-result.v1";
  commandId: string;
  deviceId: string;
  success: boolean;
  state?: Record<string, unknown>;
  error?: string;
  failureCode?: string;
  publishAttempts?: number;
  occurredAt: string;
  correlationId?: string;
  sessionId?: string;
};

export function parseCommandResult(value: Buffer): CommandResult {
  let input: unknown;
  try { input = JSON.parse(value.toString("utf8")); } catch { throw new Error("Invalid command result JSON"); }
  if (!input || typeof input !== "object") throw new Error("Invalid command result event");
  const item = input as Record<string, unknown>;
  if (item.schemaVersion !== "command-result.v1" || typeof item.commandId !== "string" || !item.commandId || typeof item.deviceId !== "string" || !item.deviceId || typeof item.success !== "boolean" || typeof item.occurredAt !== "string" || Number.isNaN(Date.parse(item.occurredAt))) {
    throw new Error("Invalid command result event");
  }
  if (item.state !== undefined && (!item.state || typeof item.state !== "object" || Array.isArray(item.state))) throw new Error("Invalid command result state");
  if (item.error !== undefined && typeof item.error !== "string") throw new Error("Invalid command result error");
  if (item.failureCode !== undefined && (typeof item.failureCode !== "string" || !item.failureCode)) throw new Error("Invalid command result failure code");
  if (item.publishAttempts !== undefined && (!Number.isInteger(item.publishAttempts) || (item.publishAttempts as number) < 0)) throw new Error("Invalid command result publish attempts");
  return item as CommandResult;
}
