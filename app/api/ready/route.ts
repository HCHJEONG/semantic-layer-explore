import { getLlmProviderConfiguration } from "@/lib/llm/provider";
import { getDatabaseStore } from "@/lib/stores/database-store";
import { getRetentionConfiguration } from "@/runtime/retention";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = await getDatabaseStore().getStatus();
    const llm = getLlmProviderConfiguration();
    return Response.json({
      status: "ready",
      database,
      physicalAdapter: process.env.PHYSICAL_ADAPTER || "simulator",
      retention: getRetentionConfiguration(),
      llm,
      gemini: {
        configured: llm.configured,
        model: llm.model,
        location: llm.location,
      },
    });
  } catch (error) {
    return Response.json(
      { status: "not-ready", error: error instanceof Error ? error.message : "Database unavailable" },
      { status: 503 },
    );
  }
}
