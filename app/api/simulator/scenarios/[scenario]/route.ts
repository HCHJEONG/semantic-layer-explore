import { z } from "zod";
import { getWorkspaceRuntime } from "@/runtime/workspace-runtime";
import { errorResponse } from "@/lib/validation";

const scenarioSchema = z.enum(["normal", "high-temperature", "dark-room", "object-approaching", "button-pressed", "sensor-disconnected"]);

export async function POST(_request: Request, context: { params: Promise<{ scenario: string }> }) {
  try {
    const { scenario } = await context.params;
    return Response.json(getWorkspaceRuntime().applyScenario(scenarioSchema.parse(scenario)));
  } catch (error) { return errorResponse(error); }
}
