export const dynamic = "force-dynamic";

export async function GET() {
  const gateway = process.env.GO_GATEWAY_URL?.trim() || "http://localhost:8080";
  try {
    const response = await fetch(new URL("/operations/summary", gateway), { cache: "no-store" });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Operations summary unavailable" },
      { status: 503 },
    );
  }
}
