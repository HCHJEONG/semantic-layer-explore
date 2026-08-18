import { z } from "zod";
import { runExplainEventWorkflow } from "@/lib/explain-workflow";
import { errorResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

const inputSchema = z.object({ eventId: z.string().trim().min(1) });

export async function POST(request: Request) {
  try {
    const { eventId } = inputSchema.parse(await request.json());
    return Response.json(await runExplainEventWorkflow(eventId));
  } catch (error) {
    return errorResponse(error);
  }
}
