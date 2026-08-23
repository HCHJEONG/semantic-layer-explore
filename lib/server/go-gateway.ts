import "server-only";

const gatewayURL = process.env.GO_GATEWAY_URL ?? "http://localhost:8080";

export async function proxyOntology(request: Request | undefined, path: string) {
  const init: RequestInit = request
    ? { method: request.method, headers: { "content-type": "application/json" }, body: request.method === "GET" ? undefined : await request.text() }
    : { method: "GET" };
  const response = await fetch(`${gatewayURL}${path}`, { ...init, cache: "no-store" });
  return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json" } });
}

export const proxyOperations = proxyOntology;
