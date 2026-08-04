import { getWorkspaceRuntime } from "@/runtime/workspace-runtime";
import { errorResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const limit = Number(new URL(request.url).searchParams.get("limit") || 50);
    return Response.json(getWorkspaceRuntime().getEvents(Number.isFinite(limit) ? limit : 50));
  } catch (error) { return errorResponse(error); }
}
