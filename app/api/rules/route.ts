import { createRule, listRules } from "@/lib/rules";
import { errorResponse } from "@/lib/validation";

export async function GET() {
  try { return Response.json(await listRules()); } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try { return Response.json(await createRule(await request.json()), { status: 201 }); }
  catch (error) { return errorResponse(error); }
}
