export async function POST() {
  const gateway = process.env.GO_GATEWAY_URL?.trim() || "http://localhost:8080";
  try {
    const response = await fetch(new URL("/graph/projection/rebuild", gateway), { method: "POST", cache: "no-store" });
    return new Response(await response.text(), { status: response.status, headers: { "content-type": "application/json" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Graph rebuild unavailable" }, { status: 503 });
  }
}
