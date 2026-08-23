import { proxyOperations } from "@/lib/server/go-gateway";

export async function POST(request: Request, context: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = await context.params;
  return proxyOperations(request, `/operations/devices/${encodeURIComponent(deviceId)}/commands`);
}
