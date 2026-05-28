import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { waitlistPromoteSchema } from "@/lib/validation";
import { authEventForRequest, verifyAuthEnvelope } from "@/lib/auth";
import { canManageEvent } from "@/lib/event-access";
import { notifyPubkey } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = waitlistPromoteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const payload = { eventId: id, pubkey: parsed.data.pubkey ?? null };
  const authEvent = authEventForRequest(req, parsed.data.signedAuthEvent);
  if (!authEvent) return NextResponse.json({ error: "missing auth event" }, { status: 401 });
  const auth = verifyAuthEnvelope(authEvent, {
    expectedAction: "waitlist.promote",
    expectedTags: { e: id },
    expectedPayload: payload,
    request: req,
  });
  if (!auth.ok || !auth.pubkey) return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: 401 });
  if (!(await canManageEvent(id, auth.pubkey))) {
    return NextResponse.json({ error: "not an organizer" }, { status: 403 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const eventRows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM "Event" WHERE id = ${id} FOR UPDATE`
    );
    if (eventRows.length === 0) return { status: "missing" as const };
    const event = await tx.event.findUnique({ where: { id } });
    if (!event) return { status: "missing" as const };
    if (event.status === "CANCELLED") return { status: "cancelled" as const };
    if (event.paymentMode === "PAID") return { status: "paid" as const };

    if (event.capacity) {
      const going = await tx.rsvp.count({ where: { eventId: id, status: "GOING" } });
      if (going >= event.capacity) return { status: "full" as const };
    }

    const rsvp = await tx.rsvp.findFirst({
      where: {
        eventId: id,
        status: "WAITLIST",
        ...(parsed.data.pubkey ? { pubkey: parsed.data.pubkey } : {}),
      },
      orderBy: { updatedAt: "asc" },
    });
    if (!rsvp) return { status: "empty" as const };

    await tx.rsvp.update({ where: { id: rsvp.id }, data: { status: "GOING" } });
    const existingTicket = await tx.ticket.findFirst({
      where: { eventId: id, buyerPubkey: rsvp.pubkey },
    });
    const ticket = existingTicket ?? await tx.ticket.create({
      data: {
        eventId: id,
        buyerPubkey: rsvp.pubkey,
        tier: "free",
        secret: crypto.randomUUID().replace(/-/g, ""),
      },
    });
    return { status: "promoted" as const, event, pubkey: rsvp.pubkey, ticketId: ticket.id };
  });

  if (result.status === "missing") return NextResponse.json({ error: "event not found" }, { status: 404 });
  if (result.status === "cancelled") return NextResponse.json({ error: "event is cancelled" }, { status: 409 });
  if (result.status === "paid") return NextResponse.json({ error: "promote waitlist from paid checkout instead" }, { status: 409 });
  if (result.status === "full") return NextResponse.json({ error: "event is still at capacity" }, { status: 409 });
  if (result.status === "empty") return NextResponse.json({ error: "waitlist is empty" }, { status: 404 });

  await notifyPubkey({
    pubkey: result.pubkey,
    type: "WAITLIST",
    title: `Spot opened: ${result.event.title}`,
    body: "The organizer promoted you from the waitlist and issued your ticket.",
    eventId: id,
    ticketId: result.ticketId,
  }).catch(() => {});

  return NextResponse.json({ ok: true, pubkey: result.pubkey, ticketId: result.ticketId });
}
