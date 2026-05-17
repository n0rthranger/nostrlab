import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { eventCreateSchema, eventFilterSchema } from "@/lib/validation";
import { eventModeToDb } from "@/lib/nostr/parse";
import { publishToRelays } from "@/lib/nostr/relay-pool";
import { eventToListDTO } from "@/lib/dto";
import { eventMatchesCategory } from "@/lib/event-categories";
import { rateLimit } from "@/lib/rate-limit";
import { bannedSet } from "@/lib/moderation";
import { clientIp } from "@/lib/request-ip";
import { ingestEventListing } from "@/lib/nostr/ingest-event";

export const dynamic = "force-dynamic";

const CATEGORY_SCAN_LIMIT = 1000;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const parsed = eventFilterSchema.safeParse(Object.fromEntries(sp));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const f = parsed.data;
  const banned = await bannedSet();

  const where: Prisma.EventWhereInput = {};
  const and: Prisma.EventWhereInput[] = [];
  if (f.city) {
    and.push({
      OR: [
        { city: { contains: f.city, mode: "insensitive" } },
        { venue: { contains: f.city, mode: "insensitive" } },
      ],
    });
  }
  if (f.mode) where.mode = eventModeToDb(f.mode);
  if (f.paid === "free") where.paymentMode = "FREE";
  if (f.paid === "paid") where.paymentMode = "PAID";
  if (f.status === "cancelled") where.status = "CANCELLED";
  else if (f.status !== "all") where.status = "ACTIVE";
  if (f.from || f.to) {
    where.startsAt = {
      gte: f.from ? new Date(f.from) : new Date(),
      ...(f.to ? { lte: new Date(f.to) } : {}),
    };
  } else {
    where.startsAt = { gte: new Date(Date.now() - 1000 * 60 * 60 * 12) };
  }
  if (f.tag) where.tags = { some: { tag: f.tag.toLowerCase() } };
  if (f.q) {
    and.push({
      OR: [
        { title: { contains: f.q, mode: "insensitive" } },
        { description: { contains: f.q, mode: "insensitive" } },
        { city: { contains: f.q, mode: "insensitive" } },
        { venue: { contains: f.q, mode: "insensitive" } },
      ],
    });
  }
  if (banned.size > 0) {
    where.organizerPubkey = { notIn: [...banned] };
  }
  if (and.length > 0) where.AND = and;

  const events = await prisma.event.findMany({
    where,
    orderBy: { startsAt: "asc" },
    take: f.category ? CATEGORY_SCAN_LIMIT : f.limit + 1,
    ...(f.cursor && !f.category ? { skip: 1, cursor: { id: f.cursor } } : {}),
    include: {
      organizer: true,
      tags: true,
      _count: { select: { rsvps: true } },
    },
  });

  const filtered = f.category
    ? events.filter((event) => eventMatchesCategory(event, f.category!))
    : events;
  const hasMore = !f.category && filtered.length > f.limit;
  const slice = (hasMore ? filtered.slice(0, f.limit) : filtered).slice(0, f.limit);
  const nextCursor = hasMore ? slice[slice.length - 1].id : null;

  return NextResponse.json({
    events: slice.map(eventToListDTO),
    nextCursor,
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const parsed = eventCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const evt = parsed.data.signedEvent;

  const ipLimit = await rateLimit(`event-create-ip:${clientIp(req)}`, { capacity: 30, refillPerSec: 1 });
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } }
    );
  }

  const rl = await rateLimit(`event-create:${evt.pubkey.toLowerCase()}`, { capacity: 5, refillPerSec: 1 / 30 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  let result;
  try {
    result = await ingestEventListing(evt, { trustNostrLabSource: true, allowNostrLabHashtag: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  if (result.status === "skipped") {
    return NextResponse.json(
      {
        error: "EVENT_NOT_INDEXED",
        message: result.reason ?? "Event did not pass NostrLab indexing policy.",
        relevance: result.relevance,
      },
      { status: result.reason === "banned" || result.reason === "community host approval required" ? 403 : 400 }
    );
  }

  if (result.status === "older") {
    return NextResponse.json({ id: result.id, nostrId: result.nostrId, ignored: "older" });
  }

  if (result.source === "nostrlab") {
    publishToRelays(evt).catch(() => {});
  }

  return NextResponse.json({ id: result.id, nostrId: result.nostrId, source: result.source });
}
