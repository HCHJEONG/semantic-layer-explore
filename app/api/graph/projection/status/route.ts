export const dynamic = "force-dynamic";

export async function GET() {
  const gateway = process.env.GO_GATEWAY_URL?.trim() || "http://localhost:8080";
  try {
    const response = await fetch(new URL("/graph/projection/status", gateway), { cache: "no-store" });
    return new Response(await response.text(), { status: response.status, headers: { "content-type": "application/json" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Graph status unavailable" }, { status: 503 });
  }
}
