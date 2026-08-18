import "server-only";

import { z } from "zod";
import type { CausalTrace, EvidenceSupport } from "@/lib/causal-trace";
import { getLlmProvider, getLlmProviderConfiguration } from "@/lib/llm/provider";

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
export type EvidenceReviewer = EvidenceReview["agent"];

export function finding(claim: string, evidenceIds: string[], support: EvidenceSupport): EvidenceFinding {
  return { claim, evidenceIds, support };
}

export function isLlmExplainReviewEnabled() {
  return process.env.EXPLAIN_LLM_REVIEW?.trim().toLowerCase() === "enabled";
}

function boundedEvidence(trace: CausalTrace, agent: EvidenceReviewer) {
  const idsByAgent: Record<EvidenceReviewer, string[]> = {
    sensor: ["trigger-reading"],
    rule: ["matched-rule"],
    execution: ["device-execution"],
  };
  const evidenceIds = new Set(idsByAgent[agent]);
  return {
    eventId: trace.eventId,
    completeness: trace.completeness,
    missing: trace.missing,
    causalSteps: trace.causalSteps.filter((step) => step.type === agent),
    evidence: trace.evidence.filter((item) => evidenceIds.has(item.id)),
  };
}

function constrainLlmReview(review: EvidenceReview, agent: EvidenceReviewer, allowedEvidenceIds: Set<string>, fallback: EvidenceReview) {
  if (review.agent !== agent) return fallback;
  const findings = review.findings.filter((item) => item.evidenceIds.length > 0 && item.evidenceIds.every((id) => allowedEvidenceIds.has(id)));
  return evidenceReviewSchema.parse({
    agent,
    findings,
    uncertainties: [
      ...review.uncertainties,
      ...(findings.length < review.findings.length ? ["Some LLM claims were removed because they cited unavailable evidence."] : []),
    ],
  });
}

function constrainCriticReview(review: CriticReview, allowedEvidenceIds: Set<string>) {
  const filterClaims = (claims: EvidenceFinding[]) => claims.filter((item) => item.evidenceIds.length > 0 && item.evidenceIds.every((id) => allowedEvidenceIds.has(id)));
  const verifiedClaims = filterClaims(review.verifiedClaims);
  const rejectedClaims = filterClaims(review.rejectedClaims);
  const removed = verifiedClaims.length + rejectedClaims.length < review.verifiedClaims.length + review.rejectedClaims.length;
  return criticReviewSchema.parse({
    verifiedClaims,
    rejectedClaims,
    uncertainties: [
      ...review.uncertainties,
      ...(removed ? ["Some LLM critic claims were removed because they cited unavailable evidence."] : []),
    ],
  });
}

const reviewSystemPrompt = [
  "You are an evidence reviewer for an Explain Why workflow.",
  "Return only claims supported by the provided evidence IDs.",
  "Do not invent sensors, rules, device states, timestamps, or hidden causes.",
  "Use support='insufficient' when the provided evidence cannot prove a claim.",
].join("\n");

const criticSystemPrompt = [
  "You are the critic agent in an Explain Why workflow.",
  "Review the structured reviewer findings against the provided evidence IDs.",
  "Return verifiedClaims and rejectedClaims only when every claim cites available evidence IDs.",
  "Do not hide missing evidence or convert uncertainty into certainty.",
].join("\n");

export async function reviewEvidenceWithOptionalLlm(
  agent: EvidenceReviewer,
  trace: CausalTrace,
  deterministicReview: EvidenceReview,
): Promise<EvidenceReview> {
  if (!isLlmExplainReviewEnabled()) return deterministicReview;
  if (!getLlmProviderConfiguration().configured) return deterministicReview;

  try {
    const traceView = boundedEvidence(trace, agent);
    const allowedEvidenceIds = new Set(traceView.evidence.map((item) => item.id));
    const review = await getLlmProvider().generateStructured({
      schema: evidenceReviewSchema,
      schemaName: `${agent}EvidenceReview`,
      temperature: 0,
      maxOutputTokens: 700,
      system: reviewSystemPrompt,
      messages: [{
        role: "user",
        content: JSON.stringify({
          reviewer: agent,
          allowedEvidenceIds: [...allowedEvidenceIds],
          trace: traceView,
          deterministicFallback: deterministicReview,
        }),
      }],
    });
    return constrainLlmReview(review, agent, allowedEvidenceIds, deterministicReview);
  } catch {
    return deterministicReview;
  }
}

export async function reviewCriticWithOptionalLlm(
  trace: CausalTrace,
  reviews: EvidenceReview[],
  deterministicReview: CriticReview,
): Promise<CriticReview> {
  if (!isLlmExplainReviewEnabled()) return deterministicReview;
  if (!getLlmProviderConfiguration().configured) return deterministicReview;

  try {
    const allowedEvidenceIds = new Set(trace.evidence.map((item) => item.id));
    const review = await getLlmProvider().generateStructured({
      schema: criticReviewSchema,
      schemaName: "criticEvidenceReview",
      temperature: 0,
      maxOutputTokens: 900,
      system: criticSystemPrompt,
      messages: [{
        role: "user",
        content: JSON.stringify({
          allowedEvidenceIds: [...allowedEvidenceIds],
          trace: {
            eventId: trace.eventId,
            completeness: trace.completeness,
            missing: trace.missing,
            evidence: trace.evidence,
          },
          reviewerFindings: reviews,
          deterministicFallback: deterministicReview,
        }),
      }],
    });
    return constrainCriticReview(review, allowedEvidenceIds);
  } catch {
    return deterministicReview;
  }
}
