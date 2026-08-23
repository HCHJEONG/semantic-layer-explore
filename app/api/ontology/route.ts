import { errorResponse } from "@/lib/server/validation";
import { getOntology } from "@/lib/services/ontology";
import { proxyOntology, usesLegacyOntology } from "@/lib/server/go-gateway";
export async function GET() { if (!usesLegacyOntology()) return proxyOntology(undefined, "/semantic/ontology"); try { return Response.json(await getOntology()); } catch (error) { return errorResponse(error); } }
