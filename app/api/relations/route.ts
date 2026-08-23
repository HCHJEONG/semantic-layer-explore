import { errorResponse, relationInput } from "@/lib/server/validation";
import { createRelation, getRelations } from "@/lib/services/ontology";
import { proxyOntology, usesLegacyOntology } from "@/lib/server/go-gateway";
export async function GET() { if (!usesLegacyOntology()) return proxyOntology(undefined, "/semantic/relations"); try { return Response.json(await getRelations()); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) {
  if (!usesLegacyOntology()) return proxyOntology(request, "/semantic/relations");
  try { const input = relationInput.parse(await request.json()); return Response.json(await createRelation(input), { status: 201 }); }
  catch (error) { return errorResponse(error); }
}
