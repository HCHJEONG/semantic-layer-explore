import "server-only";

import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { buildCausalTrace, type CausalTrace, type EvidenceSupport } from "@/lib/causal-trace";

export const evidenceFindingSchema = z.object({
  claim: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)),
  support: z.enum(["proven", "derived", "insufficient"]),
});

export const evidenceReviewSchema = z.object({
  agent: z.enum(["sensor", "rule", "execution"]),
  findings: z.array(evidenceFindingSchema),
  uncertainties: z.array(z.string()),
});

export const criticReviewSchema = z.object({
  verifiedClaims: z.array(evidenceFindingSchema),
  rejectedClaims: z.array(evidenceFindingSchema),
  uncertainties: z.array(z.string()),
});

export type EvidenceFinding = z.infer<typeof evidenceFindingSchema>;
export type EvidenceReview = z.infer<typeof evidenceReviewSchema>;
export type CriticReview = z.infer<typeof criticReviewSchema>;

export type ExplainEventWorkflowResult = CausalTrace & {
  workflow: {
    engine: "mastra-workflow";
    stages: Array<{ id: string; label: string; status: "completed" }>;
  };
  agentFindings: {
    sensor: EvidenceReview;
    rule: EvidenceReview;
    execution: EvidenceReview;
  };
  critic: CriticReview;
};

function finding(claim: string, evidenceIds: string[], support: EvidenceSupport): EvidenceFinding {
  return { claim, evidenceIds, support };
}

function reviewSensorEvidence(trace: CausalTrace): EvidenceReview {
  const evidence = trace.evidence.find((item) => item.id === "trigger-reading");
  return evidenceReviewSchema.parse({
    agent: "sensor",
    findings: evidence ? [finding(evidence.detail, [evidence.id], evidence.support)] : [],
    uncertainties: evidence ? [] : ["No linked trigger sensor reading was proven."],
  });
}

function reviewRuleEvidence(trace: CausalTrace): EvidenceReview {
  const evidence = trace.evidence.find((item) => item.id === "matched-rule");
  return evidenceReviewSchema.parse({
    agent: "rule",
    findings: evidence ? [finding(evidence.detail, [evidence.id], evidence.support)] : [],
    uncertainties: evidence ? [] : ["No matched rule event was proven for this action."],
  });
}

function reviewExecutionEvidence(trace: CausalTrace): EvidenceReview {
  const evidence = trace.evidence.find((item) => item.id === "device-execution");
  return evidenceReviewSchema.parse({
    agent: "execution",
    findings: evidence ? [finding(evidence.detail, [evidence.id], evidence.support)] : [],
    uncertainties: evidence ? [] : ["No valid device execution payload was found."],
  });
}

function verifyEvidence(trace: CausalTrace, reviews: EvidenceReview[]): CriticReview {
  const availableEvidenceIds = new Set(trace.evidence.map((item) => item.id));
  const allFindings = reviews.flatMap((review) => review.findings);
  const verifiedClaims = allFindings.filter((item) => item.evidenceIds.every((id) => availableEvidenceIds.has(id)));
  const rejectedClaims = allFindings.filter((item) => item.evidenceIds.some((id) => !availableEvidenceIds.has(id)));
  return criticReviewSchema.parse({
    verifiedClaims,
    rejectedClaims,
    uncertainties: [
      ...trace.missing.map((item) => `Missing ${item}.`),
      ...reviews.flatMap((review) => review.uncertainties),
    ],
  });
}

function buildWorkflowResult(trace: CausalTrace): ExplainEventWorkflowResult {
  const sensor = reviewSensorEvidence(trace);
  const rule = reviewRuleEvidence(trace);
  const execution = reviewExecutionEvidence(trace);
  const critic = verifyEvidence(trace, [sensor, rule, execution]);

  return {
    ...trace,
    workflow: {
      engine: "mastra-workflow",
      stages: [
        { id: "causal-trace", label: "Build deterministic causal trace", status: "completed" },
        { id: "sensor-review", label: "Review sensor evidence", status: "completed" },
        { id: "rule-review", label: "Review rule evidence", status: "completed" },
        { id: "execution-review", label: "Review execution evidence", status: "completed" },
        { id: "critic", label: "Verify evidence support", status: "completed" },
      ],
    },
    agentFindings: { sensor, rule, execution },
    critic,
  };
}

const explainInputSchema = z.object({ eventId: z.string().min(1) });
const causalTraceSchema = z.custom<CausalTrace>();
const workflowResultSchema = z.custom<ExplainEventWorkflowResult>();

const buildTraceStep = createStep({
  id: "causal-trace",
  inputSchema: explainInputSchema,
  outputSchema: causalTraceSchema,
  execute: async ({ inputData }) => buildCausalTrace(inputData.eventId),
});

const reviewEvidenceStep = createStep({
  id: "evidence-review-and-critic",
  inputSchema: causalTraceSchema,
  outputSchema: workflowResultSchema,
  execute: async ({ inputData }) => buildWorkflowResult(inputData),
});

export const explainEventWorkflow = createWorkflow({
  id: "explain-event-causal-trace",
  inputSchema: explainInputSchema,
  outputSchema: workflowResultSchema,
})
  .then(buildTraceStep)
  .then(reviewEvidenceStep)
  .commit();

export async function runExplainEventWorkflow(eventId: string): Promise<ExplainEventWorkflowResult> {
  const run = await explainEventWorkflow.createRun();
  const result = await run.start({ inputData: { eventId } });
  if (result.status !== "success") throw new Error(`Explain Event workflow failed with status: ${result.status}`);
  return workflowResultSchema.parse(result.result);
}
