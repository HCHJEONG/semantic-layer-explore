import { manualReadingSchema } from "@/domain/physical";
import { getWorkspaceRuntime } from "@/runtime/workspace-runtime";
import { errorResponse } from "@/lib/validation";

export async function POST(request: Request, context: { params: Promise<{ sensorId: string }> }) {
  try {
    const [{ sensorId }, input] = await Promise.all([context.params, request.json().then((body) => manualReadingSchema.parse(body))]);
    return Response.json(getWorkspaceRuntime().injectReading(sensorId, input.value), { status: 201 });
  } catch (error) { return errorResponse(error); }
}
