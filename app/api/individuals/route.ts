import { individualInput, errorResponse } from "@/lib/validation";
import { getDb } from "@/db";
import { semanticIndividuals } from "@/db/schema";
import { getIndividuals } from "@/lib/ontology";

export async function GET() { try { return Response.json(await getIndividuals()); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) {
  try {
    const input = individualInput.parse(await request.json());
    const [created] = await getDb().insert(semanticIndividuals).values(input).returning();
    return Response.json(created, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
