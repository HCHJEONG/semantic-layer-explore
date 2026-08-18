import { errorResponse } from "@/lib/server/validation";
import { getRelations } from "@/lib/services/ontology";
export async function GET() { try { return Response.json(await getRelations()); } catch (error) { return errorResponse(error); } }
