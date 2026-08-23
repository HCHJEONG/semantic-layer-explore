import { proxyOntology } from "@/lib/server/go-gateway";

export async function GET() { return proxyOntology(undefined, "/semantic/individuals"); }
export async function POST(request: Request) { return proxyOntology(request, "/semantic/individuals"); }
