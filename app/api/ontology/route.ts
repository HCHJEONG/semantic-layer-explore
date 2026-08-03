import { errorResponse } from "@/lib/validation";
import { getOntology } from "@/lib/ontology";
export async function GET() { try { return Response.json(await getOntology()); } catch (error) { return errorResponse(error); } }
