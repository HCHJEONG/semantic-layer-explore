import { proxyOntology } from "@/lib/server/go-gateway";

export async function GET() { return proxyOntology(undefined, "/semantic/classes"); }
export async function POST(request: Request) { return proxyOntology(request, "/semantic/classes"); }
