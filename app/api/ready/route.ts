import { sql } from "drizzle-orm";
import { getDatabasePath, getDb } from "@/db";
import { getLlmProviderConfiguration } from "@/lib/llm/provider";
import { getRetentionConfiguration } from "@/runtime/retention";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    getDb().run(sql`select 1`);
    const llm = getLlmProviderConfiguration();
    return Response.json({
      status: "ready",
      database: { status: "ready", path: getDatabasePath() },
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
