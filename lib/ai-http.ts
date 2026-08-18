import "server-only";

import { z } from "zod";
import { consumeAskAllowance, consumeExplainAllowance } from "@/lib/rate-limit";
import { InputValidationError } from "@/lib/validation";

type Allowance = Awaited<ReturnType<typeof consumeAskAllowance>>;

function rateLimitHeaders(limit: number, remaining: number) {
  return { "x-ratelimit-limit": String(limit), "x-ratelimit-remaining": String(remaining) };
}

async function enforceAllowance(request: Request, consume: (request: Request) => Promise<Allowance>, message: string) {
  const allowance = await consume(request);
  if (allowance.allowed) return { allowance, response: null };
  return {
    allowance,
    response: Response.json(
      { error: message },
      { status: 429, headers: { "retry-after": String(allowance.resetSeconds), ...rateLimitHeaders(allowance.limit, 0) } },
    ),
  };
}

export async function enforceAiAllowance(request: Request) {
  return enforceAllowance(request, consumeAskAllowance, "Daily AI limit reached. Please try again tomorrow.");
}

export async function enforceExplainAllowance(request: Request) {
  return enforceAllowance(request, consumeExplainAllowance, "Daily Explain Why LLM review limit reached. Please try again tomorrow.");
}

export function aiAllowanceHeaders(allowance: Pick<Allowance, "limit" | "remaining">) {
  return rateLimitHeaders(allowance.limit, allowance.remaining);
}

export function aiErrorResponse(error: unknown) {
  console.error("AI request failed", error);
  if (error instanceof z.ZodError) return Response.json({ error: "Invalid input", details: error.flatten() }, { status: 400 });
  if (error instanceof InputValidationError) return Response.json({ error: error.message }, { status: 400 });
  const raw = error instanceof Error ? error.message : "Unable to complete the AI request";
  const message = raw.includes("credentials are unavailable") ? "Gemini credentials are not available in this runtime." : raw;
  return Response.json({ error: message }, { status: 500 });
}
