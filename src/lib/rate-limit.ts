// Token bucket per (pubkey or ip, scope). Uses Redis when REDIS_URL is set,
// and falls back to process-local memory for development.
import Redis from "ioredis";

interface Bucket {
  tokens: number;
  refilledAt: number;
}

const buckets = new Map<string, Bucket>();
let redis: Redis | null | undefined;

function redisClient(): Redis | null {
  if (redis !== undefined) return redis;
  if (!process.env.REDIS_URL) {
    redis = null;
    return redis;
  }
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  return redis;
}

function memoryRateLimit(
  key: string,
  { capacity = 10, refillPerSec = 0.5 }: { capacity?: number; refillPerSec?: number } = {}
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: capacity, refilledAt: now };
  const elapsedSec = (now - b.refilledAt) / 1000;
  b.tokens = Math.min(capacity, b.tokens + elapsedSec * refillPerSec);
  b.refilledAt = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return { ok: false, retryAfterSec: Math.ceil((1 - b.tokens) / refillPerSec) };
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return { ok: true, retryAfterSec: 0 };
}

const REDIS_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

local data = redis.call("HMGET", key, "tokens", "refilledAt")
local tokens = tonumber(data[1])
local refilledAt = tonumber(data[2])

if tokens == nil or refilledAt == nil then
  tokens = capacity
  refilledAt = now
end

local elapsed = math.max(0, (now - refilledAt) / 1000)
tokens = math.min(capacity, tokens + elapsed * refill)
refilledAt = now

local ok = 0
local retry = 0
if tokens >= 1 then
  tokens = tokens - 1
  ok = 1
else
  retry = math.ceil((1 - tokens) / refill)
end

redis.call("HSET", key, "tokens", tokens, "refilledAt", refilledAt)
redis.call("PEXPIRE", key, ttl)
return { ok, retry }
`;

export async function rateLimit(
  key: string,
  opts: { capacity?: number; refillPerSec?: number } = {}
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const capacity = opts.capacity ?? 10;
  const refillPerSec = opts.refillPerSec ?? 0.5;
  const r = redisClient();
  if (!r) return memoryRateLimit(key, { capacity, refillPerSec });

  try {
    const ttlMs = Math.max(60_000, Math.ceil((capacity / refillPerSec) * 1000 * 2));
    const result = await r.eval(
      REDIS_SCRIPT,
      1,
      `nostrlab:rate:${key}`,
      String(capacity),
      String(refillPerSec),
      String(Date.now()),
      String(ttlMs)
    ) as [number, number];
    return { ok: Number(result[0]) === 1, retryAfterSec: Number(result[1]) || 0 };
  } catch {
    return memoryRateLimit(key, { capacity, refillPerSec });
  }
}
