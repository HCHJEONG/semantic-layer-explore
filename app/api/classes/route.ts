import { classInput, errorResponse } from "@/lib/server/validation";
import { createClass, getClasses } from "@/lib/services/ontology";

export async function GET() { try { return Response.json(await getClasses()); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) {
  try {
    const input = classInput.parse(await request.json());
    const created = await createClass(input);
    return Response.json(created, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
