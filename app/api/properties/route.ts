import { propertyInput, errorResponse } from "@/lib/server/validation";
import { createProperty, getProperties } from "@/lib/services/ontology";

export async function GET() { try { return Response.json(await getProperties()); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) {
  try {
    const input = propertyInput.parse(await request.json());
    const created = await createProperty(input);
    return Response.json(created, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
