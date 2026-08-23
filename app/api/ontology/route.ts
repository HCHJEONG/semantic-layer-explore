import { proxyOntology } from "@/lib/server/go-gateway";
export async function GET() { return proxyOntology(undefined, "/semantic/ontology"); }
