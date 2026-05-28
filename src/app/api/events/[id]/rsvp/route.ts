import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { privateRsvpCreateSchema, rsvpCreateSchema } from "@/lib/validation";
import { verifyNostrEvent } from "@/lib/nostr/verify";
import { parseRsvp, rsvpStatusToDb } from "@/lib/nostr/parse";
import { ensureUser } from "@/lib/nostr/profile";
import { publishToRelays } from "@/lib/nostr/relay-pool";
import { rateLimit } from "@/lib/rate-limit";
import { eventCoordinate } from "@/lib/nostr/event-builder";
import { isBanned } from "@/lib/moderation";
import { clientIp } from "@/lib/request-ip";
import { notifyPubkey } from "@/lib/notifications";
import { authEventForRequest, verifyAuthEnvelope } from "@/lib/auth";
import type { NostrEvent } from "@/lib/nostr/types";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const ipLimit = await rateLimit(`rsvp-ip:${clientIp(req)}`, { capacity: 60, refillPerSec: 2 });
  if (!ipLimit.ok) return NextResponse.json({ error: "rate limited" }, { status: 429 });

  let evt: NostrEvent | null = null;
  let shouldPublish = false;
  let rsvpPubkey: string;
  let nextStatus: ReturnType<typeof rsvpStatusToDb>;
  let nostrId: string;
  let rawEvent: Prisma.InputJsonValue;
  let createdAt: number;
  let expectedCoordinate: string | null = null;
  let privatePayload: string | null = null;

  const privateParsed = privateRsvpCreateSchema.safeParse(body);
  if (privateParsed.success) {
    const payload = {
      eventId: id,
      status: privateParsed.data.status,
      private: true,
    };
    const authEvent = authEventForRequest(req, privateParsed.data.signedAuthEvent);
    if (!authEvent) return NextResponse.json({ error: "missing auth event" }, { status: 401 });
    const auth = verifyAuthEnvelope(authEvent, {
      expectedAction: "rsvp.private",
      expectedTags: { event_id: id, status: privateParsed.data.status },
      expectedPayload: payload,
      request: req,
    });
    if (!auth.ok || !auth.pubkey) {
      return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: 401 });
    }
    rsvpPubkey = auth.pubkey;
    nextStatus = rsvpStatusToDb(privateParsed.data.status);
    nostrId = authEvent.id;
    rawEvent = authEvent as unknown as Prisma.InputJsonValue;
    createdAt = authEvent.created_at;
    privatePayload = JSON.stringify({ private: true, status: privateParsed.data.status });
  } else {
    const parsed = rsvpCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    evt = parsed.data.signedEvent;
    if (!verifyNostrEvent(evt)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    }
    let parsedRsvp;
    try { parsedRsvp = parseRsvp(evt); }
    catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
    rsvpPubkey = parsedRsvp.pubkey;
    nextStatus = rsvpStatusToDb(parsedRsvp.status);
    nostrId = evt.id;
    rawEvent = evt as unknown as Prisma.InputJsonValue;
    createdAt = evt.created_at;
    expectedCoordinate = parsedRsvp.eventCoordinate;
    shouldPublish = true;
  }

  const rl = await rateLimit(`rsvp:${rsvpPubkey.toLowerCase()}`, { capacity: 20, refillPerSec: 0.5 });
  if (!rl.ok) return NextResponse.json({ error: "rate limited" }, { status: 429 });

  if (await isBanned(rsvpPubkey)) {
    return NextResponse.json({ error: "banned" }, { status: 403 });
  }

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });
  if (event.status === "CANCELLED") {
    return NextResponse.json({ error: "event is cancelled" }, { status: 409 });
  }

  // Verify the RSVP's `a` tag points at THIS event.
  const expectedCoord = eventCoordinate(event.organizerPubkey, event.dTag);
  if (expectedCoordinate && expectedCoordinate !== expectedCoord) {
    return NextResponse.json({ error: "RSVP refers to a different event" }, { status: 400 });
  }

  await ensureUser(rsvpPubkey);
  const existing = await prisma.rsvp.findUnique({
    where: { eventId_pubkey: { eventId: event.id, pubkey: rsvpPubkey } },
  });

  if (existing) {
    const existingTs = (existing.rawEvent as { created_at?: number } | null)?.created_at ?? 0;
    if (createdAt < existingTs) {
      return NextResponse.json({ ok: true, ignored: "older" });
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Event" WHERE id = ${event.id} FOR UPDATE`);
    if (nextStatus === "GOING" && event.capacity) {
      const goingCount = await tx.rsvp.count({
        where: {
          eventId: event.id,
          status: "GOING",
          pubkey: { not: rsvpPubkey },
        },
      });
      if (goingCount >= event.capacity) {
        return { atCapacity: true as const, ticketId: null, ticketSecret: null };
      }
    }

    await tx.rsvp.upsert({
      where: { eventId_pubkey: { eventId: event.id, pubkey: rsvpPubkey } },
      create: {
        eventId: event.id,
        pubkey: rsvpPubkey,
        status: nextStatus,
        nostrId,
        rawEvent,
        privatePayload,
      },
      update: {
        status: nextStatus,
        nostrId,
        rawEvent,
        privatePayload,
      },
    });
    if (event.paymentMode === "FREE" && nextStatus === "GOING") {
      const existingTicket = await tx.ticket.findFirst({
        where: { eventId: event.id, buyerPubkey: rsvpPubkey },
      });
      const ticket = existingTicket ?? (await tx.ticket.create({
        data: {
          eventId: event.id,
          buyerPubkey: rsvpPubkey,
          tier: "free",
          secret: crypto.randomUUID().replace(/-/g, ""),
        },
      }));
      return { ticketId: ticket.id, ticketSecret: ticket.secret };
    }
    return { ticketId: null, ticketSecret: null };
  });

  if (result.atCapacity) {
    return NextResponse.json({ error: "event is at capacity" }, { status: 409 });
  }

  if (shouldPublish && evt) publishToRelays(evt).catch(() => {});
  if (result.ticketId && result.ticketSecret) {
    notifyPubkey({
      pubkey: rsvpPubkey,
      type: "TICKET_ISSUED",
      title: `Ticket issued: ${event.title}`,
      body: "Your RSVP generated a check-in ticket.",
      eventId: event.id,
      ticketId: result.ticketId,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, ...result });
}
