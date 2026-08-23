import { getEventStore } from "@/lib/stores";
import { errorResponse } from "@/lib/server/validation";
import { proxyOperations, usesLegacyEvents } from "@/lib/server/go-gateway";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!usesLegacyEvents()) return proxyOperations(undefined, `/operations/events${new URL(request.url).search}`);
  try {
    const limit = Number(new URL(request.url).searchParams.get("limit") || 50);
    return Response.json(await getEventStore().listEvents(Number.isFinite(limit) ? limit : 50));
  } catch (error) { return errorResponse(error); }
}
