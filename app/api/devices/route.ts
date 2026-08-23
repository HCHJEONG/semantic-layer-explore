import { getWorkspaceRuntime } from "@/runtime/workspace-runtime";
import { errorResponse } from "@/lib/server/validation";
import { proxyOperations, usesLegacyOperations } from "@/lib/server/go-gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!usesLegacyOperations()) return proxyOperations(undefined, "/operations/devices");
  try {
    const runtime = getWorkspaceRuntime();
    runtime.start();
    return Response.json(runtime.adapter.getDevices());
  } catch (error) { return errorResponse(error); }
}
