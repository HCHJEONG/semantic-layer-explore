import { getWorkspaceRuntime } from "@/runtime/workspace-runtime";
import { errorResponse } from "@/lib/server/validation";
import { proxyOperations, usesLegacyOperations } from "@/lib/server/go-gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!usesLegacyOperations()) return proxyOperations(undefined, "/operations/sensors");
  try {
    const runtime = getWorkspaceRuntime();
    runtime.start();
    const latest = new Map(runtime.adapter.getLatestReadings().map((reading) => [reading.sensorId, reading]));
    return Response.json(runtime.adapter.getSensors().map((sensor) => ({ ...sensor, latestReading: latest.get(sensor.id) ?? null })));
  } catch (error) { return errorResponse(error); }
}
