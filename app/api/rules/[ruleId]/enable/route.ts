import { setRuleEnabled } from "@/lib/rules";
import { errorResponse } from "@/lib/validation";

export async function POST(_request: Request, context: { params: Promise<{ ruleId: string }> }) {
  try {
    const rule = await setRuleEnabled((await context.params).ruleId, true);
    return rule ? Response.json(rule) : Response.json({ error: "Rule not found" }, { status: 404 });
  } catch (error) { return errorResponse(error); }
}
