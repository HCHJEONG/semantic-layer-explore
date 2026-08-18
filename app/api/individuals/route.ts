import { individualInput, errorResponse } from "@/lib/server/validation";
import { createIndividual, getIndividuals } from "@/lib/services/ontology";

export async function GET() { try { return Response.json(await getIndividuals()); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) {
  try {
    const input = individualInput.parse(await request.json());
    const created = await createIndividual(input);
    return Response.json(created, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
