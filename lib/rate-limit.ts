const DAILY_LIMIT = 10;
const localCounts = new Map<string, number>();

function secondsUntilUtcMidnight() {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((midnight - now.getTime()) / 1000));
}

export async function consumeAskAllowance(request: Request) {
  const date = new Date().toISOString().slice(0, 10);
  const client = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${date}:${client}`;
  let count = localCounts.get(key) ?? 0;
  const edgeCache = typeof caches === "undefined" ? undefined : (caches as unknown as { default?: Cache }).default;
  const cacheRequest = new Request(`https://rate-limit.internal/ask/${date}/${encodeURIComponent(client)}`);
  if (edgeCache) {
    const stored = await edgeCache.match(cacheRequest);
    if (stored) count = Number(await stored.text()) || 0;
  }
  if (count >= DAILY_LIMIT) return { allowed: false, remaining: 0, resetSeconds: secondsUntilUtcMidnight() };
  count += 1;
  localCounts.set(key, count);
  if (edgeCache) await edgeCache.put(cacheRequest, new Response(String(count), { headers: { "cache-control": `public, max-age=${secondsUntilUtcMidnight()}` } }));
  return { allowed: true, remaining: DAILY_LIMIT - count, resetSeconds: secondsUntilUtcMidnight() };
}
