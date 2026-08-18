const DEFAULT_ASK_DAILY_LIMIT = 10;
const DEFAULT_EXPLAIN_DAILY_LIMIT = 5;
const localCounts = new Map<string, number>();

export type RateLimitBucket = "ask" | "explain";

function getDailyLimit(bucket: RateLimitBucket) {
  const raw = bucket === "ask" ? process.env.ASK_AI_DAILY_LIMIT : process.env.EXPLAIN_AI_DAILY_LIMIT;
  const fallback = bucket === "ask" ? DEFAULT_ASK_DAILY_LIMIT : DEFAULT_EXPLAIN_DAILY_LIMIT;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function secondsUntilUtcMidnight() {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((midnight - now.getTime()) / 1000));
}

export async function consumeDailyAllowance(request: Request, bucket: RateLimitBucket) {
  const date = new Date().toISOString().slice(0, 10);
  const client = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = getDailyLimit(bucket);
  const key = `${bucket}:${date}:${client}`;
  let count = localCounts.get(key) ?? 0;
  const edgeCache = typeof caches === "undefined" ? undefined : (caches as unknown as { default?: Cache }).default;
  const cacheRequest = new Request(`https://rate-limit.internal/${bucket}/${date}/${encodeURIComponent(client)}`);
  if (edgeCache) {
    const stored = await edgeCache.match(cacheRequest);
    if (stored) count = Number(await stored.text()) || 0;
  }
  if (count >= limit) return { allowed: false, remaining: 0, resetSeconds: secondsUntilUtcMidnight(), limit };
  count += 1;
  localCounts.set(key, count);
  if (edgeCache) await edgeCache.put(cacheRequest, new Response(String(count), { headers: { "cache-control": `public, max-age=${secondsUntilUtcMidnight()}` } }));
  return { allowed: true, remaining: limit - count, resetSeconds: secondsUntilUtcMidnight(), limit };
}

export async function consumeAskAllowance(request: Request) {
  return consumeDailyAllowance(request, "ask");
}

export async function consumeExplainAllowance(request: Request) {
  return consumeDailyAllowance(request, "explain");
}
