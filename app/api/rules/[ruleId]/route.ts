import { rulePatchSchema } from "@/domain/rule";
import { deleteRule, getRule, updateRule } from "@/lib/services/rules";
import { errorResponse } from "@/lib/server/validation";
import { proxyOperations, usesLegacyOperations } from "@/lib/server/go-gateway";

type Context = { params: Promise<{ ruleId: string }> };

export async function GET(_request: Request, context: Context) {
  const { ruleId } = await context.params;
  if (!usesLegacyOperations()) return proxyOperations(undefined, `/operations/rules/${encodeURIComponent(ruleId)}`);
  try {
    const rule = await getRule(ruleId);
    return rule ? Response.json(rule) : Response.json({ error: "Rule not found" }, { status: 404 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  const { ruleId } = await context.params;
  if (!usesLegacyOperations()) return proxyOperations(request, `/operations/rules/${encodeURIComponent(ruleId)}`);
  try {
    const patch = rulePatchSchema.parse(await request.json());
    const rule = await updateRule(ruleId, patch);
    return rule ? Response.json(rule) : Response.json({ error: "Rule not found" }, { status: 404 });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(_request: Request, context: Context) {
  const { ruleId } = await context.params;
  if (!usesLegacyOperations()) return proxyOperations(new Request(_request.url, { method: "DELETE" }), `/operations/rules/${encodeURIComponent(ruleId)}`);
  try {
    return await deleteRule(ruleId)
      ? new Response(null, { status: 204 })
      : Response.json({ error: "Rule not found" }, { status: 404 });
  } catch (error) { return errorResponse(error); }
}
