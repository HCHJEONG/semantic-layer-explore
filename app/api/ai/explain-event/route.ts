import { z } from "zod";
import { runExplainEventWorkflow } from "@/lib/explain/workflow";
import { aiAllowanceHeaders, enforceExplainAllowance } from "@/lib/ai/http";
import { isLlmExplainReviewActive } from "@/lib/ai/llm/explain-review";
import { errorResponse } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

const inputSchema = z.object({ eventId: z.string().trim().min(1) });

export async function POST(request: Request) {
  try {
    const { eventId } = inputSchema.parse(await request.json());
    if (isLlmExplainReviewActive()) {
      const { allowance, response: limited } = await enforceExplainAllowance(request);
      if (limited) return limited;
      return Response.json(await runExplainEventWorkflow(eventId), { headers: aiAllowanceHeaders(allowance) });
    }
    return Response.json(await runExplainEventWorkflow(eventId));
  } catch (error) {
    return errorResponse(error);
  }
}
