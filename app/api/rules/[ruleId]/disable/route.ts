import { setRuleEnabled } from "@/lib/services/rules";
import { errorResponse } from "@/lib/server/validation";
import { proxyOperations, usesLegacyOperations } from "@/lib/server/go-gateway";

export async function POST(_request: Request, context: { params: Promise<{ ruleId: string }> }) {
  const { ruleId } = await context.params;
  if (!usesLegacyOperations()) return proxyOperations(new Request(_request.url, { method: "POST" }), `/operations/rules/${encodeURIComponent(ruleId)}/disable`);
  try {
    const rule = await setRuleEnabled(ruleId, false);
    return rule ? Response.json(rule) : Response.json({ error: "Rule not found" }, { status: 404 });
  } catch (error) { return errorResponse(error); }
}
