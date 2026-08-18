import { errorResponse } from "@/lib/server/validation";
import { getOntology } from "@/lib/services/ontology";
export async function GET() { try { return Response.json(await getOntology()); } catch (error) { return errorResponse(error); } }
