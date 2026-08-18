import { setRuleEnabled } from "@/lib/services/rules";
import { errorResponse } from "@/lib/server/validation";

export async function POST(_request: Request, context: { params: Promise<{ ruleId: string }> }) {
  try {
    const rule = await setRuleEnabled((await context.params).ruleId, false);
    return rule ? Response.json(rule) : Response.json({ error: "Rule not found" }, { status: 404 });
  } catch (error) { return errorResponse(error); }
}
