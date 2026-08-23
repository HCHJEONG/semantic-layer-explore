import { individualInput, errorResponse } from "@/lib/server/validation";
import { createIndividual, getIndividuals } from "@/lib/services/ontology";
import { proxyOntology, usesLegacyOntology } from "@/lib/server/go-gateway";

export async function GET() { if (!usesLegacyOntology()) return proxyOntology(undefined, "/semantic/individuals"); try { return Response.json(await getIndividuals()); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) {
  if (!usesLegacyOntology()) return proxyOntology(request, "/semantic/individuals");
  try {
    const input = individualInput.parse(await request.json());
    const created = await createIndividual(input);
    return Response.json(created, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
