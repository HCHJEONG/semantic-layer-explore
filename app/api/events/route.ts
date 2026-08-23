import { proxyOperations } from "@/lib/server/go-gateway";

export const dynamic = "force-dynamic";

export async function GET(request: Request) { return proxyOperations(undefined, `/operations/events${new URL(request.url).search}`); }
