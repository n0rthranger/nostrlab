import { NextResponse, type NextRequest } from "next/server";
import { findDuplicateEvent } from "@/lib/events/dedupe";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { eventDuplicateCheckSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ipLimit = await rateLimit(`event-duplicate-check-ip:${clientIp(req)}`, { capacity: 60, refillPerSec: 1 });
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } }
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const parsed = eventDuplicateCheckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const startsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "invalid start time" }, { status: 400 });
  }

  const duplicate = await findDuplicateEvent({
    ...parsed.data,
    startsAt,
  });

  return NextResponse.json({ duplicate });
}
