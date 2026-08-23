import { propertyInput, errorResponse } from "@/lib/server/validation";
import { createProperty, getProperties } from "@/lib/services/ontology";
import { proxyOntology, usesLegacyOntology } from "@/lib/server/go-gateway";

export async function GET() { if (!usesLegacyOntology()) return proxyOntology(undefined, "/semantic/properties"); try { return Response.json(await getProperties()); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) {
  if (!usesLegacyOntology()) return proxyOntology(request, "/semantic/properties");
  try {
    const input = propertyInput.parse(await request.json());
    const created = await createProperty(input);
    return Response.json(created, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
