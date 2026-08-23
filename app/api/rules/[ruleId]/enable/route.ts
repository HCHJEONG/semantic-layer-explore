import { proxyOperations } from "@/lib/server/go-gateway";

export async function POST(_request: Request, context: { params: Promise<{ ruleId: string }> }) {
  const { ruleId } = await context.params;
  return proxyOperations(new Request(_request.url, { method: "POST" }), `/operations/rules/${encodeURIComponent(ruleId)}/enable`);
}
