import { errorResponse } from "@/lib/validation";
import { getRelations } from "@/lib/ontology";
export async function GET() { try { return Response.json(await getRelations()); } catch (error) { return errorResponse(error); } }
