import { errorResponse } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gateway = process.env.GO_GATEWAY_URL?.trim() || "http://localhost:8080";
  const source = new URL("/operations/events/stream", gateway);
  source.search = new URL(request.url).search;
  try {
    const lastEventId = request.headers.get("last-event-id");
    const response = await fetch(source, { headers: lastEventId ? { "last-event-id": lastEventId } : undefined, cache: "no-store" });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": response.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
      },
    });
  } catch (error) { return errorResponse(error); }
}
