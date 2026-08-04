import { getWorkspaceRuntime } from "@/runtime/workspace-runtime";
import { errorResponse } from "@/lib/validation";

export async function POST() {
  try {
    const runtime = getWorkspaceRuntime();
    runtime.stop();
    return Response.json(runtime.adapter.getStatus());
  } catch (error) { return errorResponse(error); }
}
