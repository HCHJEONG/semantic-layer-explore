export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gateway = process.env.GO_GATEWAY_URL?.trim() || "http://localhost:8080";
  const url = new URL(request.url);
  const target = new URL("/operations/agent-results", gateway);
  const limit = url.searchParams.get("limit");
  if (limit) target.searchParams.set("limit", limit);

  try {
    const response = await fetch(target, { cache: "no-store" });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Agent results unavailable" },
      { status: 503 },
    );
  }
}
