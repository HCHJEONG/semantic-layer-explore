import { classInput, errorResponse } from "@/lib/server/validation";
import { createClass, getClasses } from "@/lib/services/ontology";
import { proxyOntology, usesLegacyOntology } from "@/lib/server/go-gateway";

export async function GET() { if (!usesLegacyOntology()) return proxyOntology(undefined, "/semantic/classes"); try { return Response.json(await getClasses()); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) {
  if (!usesLegacyOntology()) return proxyOntology(request, "/semantic/classes");
  try {
    const input = classInput.parse(await request.json());
    const created = await createClass(input);
    return Response.json(created, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
