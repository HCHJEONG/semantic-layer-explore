import { propertyInput, errorResponse } from "@/lib/validation";
import { getDb } from "@/db";
import { semanticProperties } from "@/db/schema";
import { getProperties } from "@/lib/ontology";

export async function GET() { try { return Response.json(await getProperties()); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) {
  try {
    const input = propertyInput.parse(await request.json());
    const [created] = await getDb().insert(semanticProperties).values(input).returning();
    return Response.json(created, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
