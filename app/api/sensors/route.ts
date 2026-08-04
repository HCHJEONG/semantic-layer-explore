import { getWorkspaceRuntime } from "@/runtime/workspace-runtime";
import { errorResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const runtime = getWorkspaceRuntime();
    runtime.start();
    const latest = new Map(runtime.adapter.getLatestReadings().map((reading) => [reading.sensorId, reading]));
    return Response.json(runtime.adapter.getSensors().map((sensor) => ({ ...sensor, latestReading: latest.get(sensor.id) ?? null })));
  } catch (error) { return errorResponse(error); }
}
