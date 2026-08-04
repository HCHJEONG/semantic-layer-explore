import { classInput, errorResponse } from "@/lib/validation";
import { getDb } from "@/db";
import { classes } from "@/db/schema";
import { getClasses } from "@/lib/ontology";

export async function GET() { try { return Response.json(await getClasses()); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) {
  try {
    const input = classInput.parse(await request.json());
    const [created] = await getDb().insert(classes).values(input).returning();
    return Response.json(created, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
