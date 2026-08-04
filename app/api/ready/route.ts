import { sql } from "drizzle-orm";
import { getDatabasePath, getDb } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    getDb().run(sql`select 1`);
    return Response.json({
      status: "ready",
      database: { status: "ready", path: getDatabasePath() },
      physicalAdapter: process.env.PHYSICAL_ADAPTER || "simulator",
      gemini: {
        configured: Boolean(process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_APPLICATION_CREDENTIALS),
        model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
      },
    });
  } catch (error) {
    return Response.json(
      { status: "not-ready", error: error instanceof Error ? error.message : "Database unavailable" },
      { status: 503 },
    );
  }
}
