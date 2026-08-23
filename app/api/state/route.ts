import { proxyOperations } from "@/lib/server/go-gateway";

export const dynamic = "force-dynamic";

export async function GET() { return proxyOperations(undefined, "/operations/state"); }
