import { getWorkspaceRuntime } from "@/runtime/workspace-runtime";
import { errorResponse } from "@/lib/server/validation";

export async function POST() {
  try {
    const runtime = getWorkspaceRuntime();
    runtime.start();
    return Response.json(runtime.adapter.getStatus());
  } catch (error) { return errorResponse(error); }
}
