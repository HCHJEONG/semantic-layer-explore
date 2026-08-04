import { getWorkspaceRuntime } from "@/runtime/workspace-runtime";
import { errorResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const runtime = getWorkspaceRuntime();
    runtime.start();
    return Response.json(runtime.adapter.getDevices());
  } catch (error) { return errorResponse(error); }
}
