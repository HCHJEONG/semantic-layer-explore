import { proxyOperations } from "@/lib/server/go-gateway";

export async function GET() { return proxyOperations(undefined, "/operations/rules"); }

export async function POST(request: Request) { return proxyOperations(request, "/operations/rules"); }
