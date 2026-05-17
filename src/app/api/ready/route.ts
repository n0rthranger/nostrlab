import { NextResponse } from "next/server";
import Redis from "ioredis";
import { prisma } from "@/lib/prisma";
import { productionReadinessChecks, hasBlockingReleaseFailures } from "@/lib/production-readiness";

export const dynamic = "force-dynamic";

async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function checkRedis() {
  if (!process.env.REDIS_URL) return { ok: false, skipped: true, error: "REDIS_URL not configured" };
  const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 1500,
  });
  try {
    await redis.ping();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    redis.disconnect();
  }
}

export async function GET() {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const env = productionReadinessChecks();
  const ok = database.ok && redis.ok && !hasBlockingReleaseFailures(env);
  return NextResponse.json(
    {
      ok,
      service: "nostrlab",
      checks: {
        database,
        redis,
        env,
      },
      ts: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
