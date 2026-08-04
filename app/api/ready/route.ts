import { sql } from "drizzle-orm";
import { getDatabasePath, getDb } from "@/db";
import { getGeminiConfiguration } from "@/lib/gemini";
import { getRetentionConfiguration } from "@/runtime/retention";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    getDb().run(sql`select 1`);
    const gemini = getGeminiConfiguration();
    return Response.json({
      status: "ready",
      database: { status: "ready", path: getDatabasePath() },
      physicalAdapter: process.env.PHYSICAL_ADAPTER || "simulator",
      retention: getRetentionConfiguration(),
      gemini: {
        configured: gemini.configured,
        model: gemini.model,
        location: gemini.location,
      },
    });
  } catch (error) {
    return Response.json(
      { status: "not-ready", error: error instanceof Error ? error.message : "Database unavailable" },
      { status: 503 },
    );
  }
}
