import { getWorkspaceRuntime } from "@/runtime/workspace-runtime";
import { errorResponse } from "@/lib/server/validation";
import { proxyOperations, usesLegacyOperations } from "@/lib/server/go-gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!usesLegacyOperations()) return proxyOperations(undefined, "/operations/state");
  try { return Response.json(getWorkspaceRuntime().getState()); }
  catch (error) { return errorResponse(error); }
}
