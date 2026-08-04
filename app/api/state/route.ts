import { getWorkspaceRuntime } from "@/runtime/workspace-runtime";
import { errorResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return Response.json(getWorkspaceRuntime().getState()); }
  catch (error) { return errorResponse(error); }
}
