import "server-only";

import { InputValidationError } from "@/lib/server/validation";

export type EvidenceSupport = "proven" | "derived" | "insufficient";
export type TraceCompleteness = "complete" | "partial" | "insufficient";
export type WorkspaceEvent = { id: number; eventId: string; type: string; sourceType: string; sourceId: string; payload: unknown; occurredAt: string };
export type TraceEvidence = { id: string; label: string; support: EvidenceSupport; eventId?: string; eventType?: string; detail: string };
export type CausalTrace = {
  eventId: string;
  explainable: boolean;
  completeness: TraceCompleteness;
  title: string;
  summary: string;
  selectedEvent?: WorkspaceEvent;
  triggerReading?: unknown;
  matchedRule?: { ruleId: string; condition: unknown; action: unknown };
  ruleEvent?: WorkspaceEvent;
  deviceExecution?: WorkspaceEvent;
  resultingState?: unknown;
  missing: string[];
  evidence: TraceEvidence[];
  causalSteps: Array<{ type: "sensor" | "rule" | "execution"; label: string; detail: string; evidenceId?: string; support: EvidenceSupport }>;
};

export async function buildCausalTrace(eventId: string): Promise<CausalTrace> {
  const gateway = process.env.GO_GATEWAY_URL?.trim() || "http://localhost:8080";
  const response = await fetch(new URL(`/operations/causal-trace/${encodeURIComponent(eventId)}`, gateway), { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new InputValidationError(typeof body?.error === "string" ? body.error : `Unknown event: ${eventId}`);
  return body as CausalTrace;
}
