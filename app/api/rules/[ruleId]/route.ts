import { proxyOperations } from "@/lib/server/go-gateway";

type Context = { params: Promise<{ ruleId: string }> };

export async function GET(_request: Request, context: Context) {
  const { ruleId } = await context.params;
  return proxyOperations(undefined, `/operations/rules/${encodeURIComponent(ruleId)}`);
}

export async function PATCH(request: Request, context: Context) {
  const { ruleId } = await context.params;
  return proxyOperations(request, `/operations/rules/${encodeURIComponent(ruleId)}`);
}

export async function DELETE(_request: Request, context: Context) {
  const { ruleId } = await context.params;
  return proxyOperations(new Request(_request.url, { method: "DELETE" }), `/operations/rules/${encodeURIComponent(ruleId)}`);
}
