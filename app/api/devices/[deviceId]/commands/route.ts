import { z } from "zod";
import { deviceCommandNameSchema } from "@/domain/physical";
import { getWorkspaceRuntime } from "@/runtime/workspace-runtime";
import { errorResponse } from "@/lib/server/validation";
import { proxyOperations, usesLegacyOperations } from "@/lib/server/go-gateway";

const commandInputSchema = z.object({ command: deviceCommandNameSchema, value: z.number().optional() });

export async function POST(request: Request, context: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = await context.params;
  if (!usesLegacyOperations()) return proxyOperations(request, `/operations/devices/${encodeURIComponent(deviceId)}/commands`);
  try {
    const input = commandInputSchema.parse(await request.json());
    const runtime = getWorkspaceRuntime();
    const device = runtime.adapter.getDevices().find((item) => item.id === deviceId);
    if (!device) return Response.json({ error: "Device not found" }, { status: 404 });
    const result = await runtime.executeCommand({
      commandId: crypto.randomUUID(), deviceId, deviceType: device.type,
      command: input.command, value: input.value, issuedBy: "user", issuedAt: new Date().toISOString(),
    });
    return Response.json(result, { status: result.success ? 200 : 422 });
  } catch (error) { return errorResponse(error); }
}
