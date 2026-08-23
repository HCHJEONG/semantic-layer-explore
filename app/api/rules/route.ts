import { createRule, listRules } from "@/lib/services/rules";
import { errorResponse } from "@/lib/server/validation";
import { proxyOperations, usesLegacyOperations } from "@/lib/server/go-gateway";

export async function GET() {
  if (!usesLegacyOperations()) return proxyOperations(undefined, "/operations/rules");
  try { return Response.json(await listRules()); } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  if (!usesLegacyOperations()) return proxyOperations(request, "/operations/rules");
  try { return Response.json(await createRule(await request.json()), { status: 201 }); }
  catch (error) { return errorResponse(error); }
}
