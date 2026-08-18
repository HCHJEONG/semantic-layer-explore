import "server-only";

import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { buildCausalTrace, type CausalTrace } from "@/lib/explain/causal-trace";
import {
  criticReviewSchema,
  evidenceReviewSchema,
  finding,
  reviewCriticWithOptionalLlm,
  reviewEvidenceWithOptionalLlm,
  type CriticReview,
  type EvidenceReview,
} from "@/lib/ai/llm/explain-review";

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

function buildWorkflowResult(trace: CausalTrace, reviews: { sensor: EvidenceReview; rule: EvidenceReview; execution: EvidenceReview }, critic: CriticReview): ExplainEventWorkflowResult {
  const { sensor, rule, execution } = reviews;

  return {
    ...trace,
    workflow: {
      engine: "mastra-workflow",
      stages: [
        { id: "causal-trace", label: "Build deterministic causal trace", status: "completed" },
        { id: "sensor-review", label: "Review sensor evidence", status: "completed" },
        { id: "rule-review", label: "Review rule evidence", status: "completed" },
        { id: "execution-review", label: "Review execution evidence", status: "completed" },
        { id: "critic", label: "Review claims with optional LLM critic", status: "completed" },
        { id: "final-verifier", label: "Constrain critic output with deterministic verifier", status: "completed" },
      ],
    },
    agentFindings: { sensor, rule, execution },
    critic,
  };
}

const explainInputSchema = z.object({ eventId: z.string().min(1) });
const causalTraceSchema = z.custom<CausalTrace>();
const workflowResultSchema = z.custom<ExplainEventWorkflowResult>();
const parallelReviewOutputSchema = z.object({
  "sensor-review": evidenceReviewSchema,
  "rule-review": evidenceReviewSchema,
  "execution-review": evidenceReviewSchema,
});
const criticInputSchema = z.object({
  trace: causalTraceSchema,
  reviews: z.object({
    sensor: evidenceReviewSchema,
    rule: evidenceReviewSchema,
    execution: evidenceReviewSchema,
  }),
});

const buildTraceStep = createStep({
  id: "causal-trace",
  inputSchema: explainInputSchema,
  outputSchema: causalTraceSchema,
  execute: async ({ inputData }) => buildCausalTrace(inputData.eventId),
});

const sensorReviewStep = createStep({
  id: "sensor-review",
  inputSchema: causalTraceSchema,
  outputSchema: evidenceReviewSchema,
  execute: async ({ inputData }) => reviewEvidenceWithOptionalLlm("sensor", inputData, reviewSensorEvidence(inputData)),
});

const ruleReviewStep = createStep({
  id: "rule-review",
  inputSchema: causalTraceSchema,
  outputSchema: evidenceReviewSchema,
  execute: async ({ inputData }) => reviewEvidenceWithOptionalLlm("rule", inputData, reviewRuleEvidence(inputData)),
});

const executionReviewStep = createStep({
  id: "execution-review",
  inputSchema: causalTraceSchema,
  outputSchema: evidenceReviewSchema,
  execute: async ({ inputData }) => reviewEvidenceWithOptionalLlm("execution", inputData, reviewExecutionEvidence(inputData)),
});

const criticStep = createStep({
  id: "critic",
  inputSchema: criticInputSchema,
  outputSchema: workflowResultSchema,
  execute: async ({ inputData }) => {
    const reviewList = [inputData.reviews.sensor, inputData.reviews.rule, inputData.reviews.execution];
    const deterministicCritic = verifyEvidence(inputData.trace, reviewList);
    const critic = await reviewCriticWithOptionalLlm(inputData.trace, reviewList, deterministicCritic);
    return buildWorkflowResult(inputData.trace, inputData.reviews, critic);
  },
});

export const explainEventWorkflow = createWorkflow({
  id: "explain-event-causal-trace",
  inputSchema: explainInputSchema,
  outputSchema: workflowResultSchema,
})
  .then(buildTraceStep)
  .parallel([sensorReviewStep, ruleReviewStep, executionReviewStep])
  .map(async ({ inputData, getStepResult }) => {
    const reviews = parallelReviewOutputSchema.parse(inputData);
    return criticInputSchema.parse({
      trace: getStepResult(buildTraceStep),
      reviews: {
        sensor: reviews["sensor-review"],
        rule: reviews["rule-review"],
        execution: reviews["execution-review"],
      },
    });
  })
  .then(criticStep)
  .commit();

export async function runExplainEventWorkflow(eventId: string): Promise<ExplainEventWorkflowResult> {
  const run = await explainEventWorkflow.createRun();
  const result = await run.start({ inputData: { eventId } });
  if (result.status !== "success") throw new Error(`Explain Event workflow failed with status: ${result.status}`);
  return workflowResultSchema.parse(result.result);
}
