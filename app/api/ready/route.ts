import { getLlmProviderConfiguration } from "@/lib/ai/llm/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  const gateway = process.env.GO_GATEWAY_URL?.trim() || "http://localhost:8080";
  try {
    const response = await fetch(new URL("/ready", gateway), { cache: "no-store" });
    if (!response.ok) throw new Error(`Go Gateway readiness returned ${response.status}`);
    const llm = getLlmProviderConfiguration();
    return Response.json({ status: "ready", gateway: await response.json(), llm, gemini: { configured: llm.configured, model: llm.model, location: llm.location } });
  } catch (error) {
    return Response.json({ status: "not-ready", error: error instanceof Error ? error.message : "Go Gateway unavailable" }, { status: 503 });
  }
}
