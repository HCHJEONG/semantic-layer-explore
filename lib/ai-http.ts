import "server-only";

import { z } from "zod";
import { consumeAskAllowance } from "@/lib/rate-limit";
import { InputValidationError } from "@/lib/validation";

export async function enforceAiAllowance(request: Request) {
  const allowance = await consumeAskAllowance(request);
  if (allowance.allowed) return { allowance, response: null };
  return {
    allowance,
    response: Response.json(
      { error: "Daily AI limit reached. Please try again tomorrow." },
      { status: 429, headers: { "retry-after": String(allowance.resetSeconds), "x-ratelimit-limit": "10", "x-ratelimit-remaining": "0" } },
    ),
  };
}

export function aiResponseHeaders(remaining: number) {
  return { "x-ratelimit-limit": "10", "x-ratelimit-remaining": String(remaining) };
}

export function aiErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) return Response.json({ error: "Invalid input", details: error.flatten() }, { status: 400 });
  if (error instanceof InputValidationError) return Response.json({ error: error.message }, { status: 400 });
  const raw = error instanceof Error ? error.message : "Unable to complete the AI request";
  const message = raw.includes("credentials are unavailable") ? "Gemini credentials are not available in this runtime." : raw;
  return Response.json({ error: message }, { status: 500 });
}
