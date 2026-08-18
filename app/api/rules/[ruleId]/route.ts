import { rulePatchSchema } from "@/domain/rule";
import { deleteRule, getRule, updateRule } from "@/lib/services/rules";
import { errorResponse } from "@/lib/server/validation";

type Context = { params: Promise<{ ruleId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const rule = await getRule((await context.params).ruleId);
    return rule ? Response.json(rule) : Response.json({ error: "Rule not found" }, { status: 404 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const [{ ruleId }, patch] = await Promise.all([context.params, request.json().then((body) => rulePatchSchema.parse(body))]);
    const rule = await updateRule(ruleId, patch);
    return rule ? Response.json(rule) : Response.json({ error: "Rule not found" }, { status: 404 });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    return await deleteRule((await context.params).ruleId)
      ? new Response(null, { status: 204 })
      : Response.json({ error: "Rule not found" }, { status: 404 });
  } catch (error) { return errorResponse(error); }
}
