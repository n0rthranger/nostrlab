import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkInSchema } from "@/lib/validation";
import { verifyAuthEnvelope } from "@/lib/auth";
import { verifyTicketCredential } from "@/lib/tickets/proof";
import type { NostrEvent } from "@/lib/nostr/types";

// Organizer-only: verify a fresh signed Nostr auth event whose pubkey matches
// the event's organizer (or a co-host). Then mark the ticket checked in.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = checkInSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      event: { include: { cohosts: true } },
      payment: {
        select: {
          provider: true,
          paymentHash: true,
          amountSats: true,
          preimage: true,
        },
      },
    },
  });
  if (!ticket) return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  if (ticket.secret !== parsed.data.ticketSecret) {
    return NextResponse.json({ error: "ticket secret mismatch" }, { status: 400 });
  }
  if (ticket.paymentId && !parsed.data.ticketProof) {
    return NextResponse.json({ error: "signed ticket proof required" }, { status: 400 });
  }
  if (parsed.data.ticketProof) {
    const proof = verifyTicketCredential({
      ticketId: ticket.id,
      eventId: ticket.eventId,
      buyerPubkey: ticket.buyerPubkey,
      tier: ticket.tier,
      secret: parsed.data.ticketSecret,
      proof: parsed.data.ticketProof as NostrEvent,
      storedProofId: ticket.nostrId,
      payment: ticket.payment,
      paymentPreimage: parsed.data.paymentPreimage,
    });
    if (!proof.ok) return NextResponse.json({ error: proof.reason }, { status: 400 });
  }

  const auth = verifyAuthEnvelope(parsed.data.signedAuthEvent, {
    expectedAction: "checkin",
    expectedTags: {
      event_id: ticket.eventId,
      t: ticket.id,
    },
    expectedPayload: {
      eventId: ticket.eventId,
      ticketId: ticket.id,
      ticketSecret: parsed.data.ticketSecret,
    },
  });
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: 401 });

  const allowed = new Set([
    ticket.event.organizerPubkey,
    ...ticket.event.cohosts.map((c) => c.pubkey),
  ]);
  if (!allowed.has(auth.pubkey!)) {
    return NextResponse.json({ error: "not an organizer" }, { status: 403 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.ticket.updateMany({
      where: { id: ticket.id, checkedInAt: null },
      data: { checkedInAt: now },
    });
    if (updated.count === 0) {
      const fresh = await tx.ticket.findUnique({
        where: { id: ticket.id },
        select: { checkedInAt: true },
      });
      return { alreadyCheckedIn: true, checkedInAt: fresh?.checkedInAt ?? ticket.checkedInAt };
    }
    await tx.checkIn.create({
      data: {
        ticketId: ticket.id,
        eventId: ticket.eventId,
        scannedByPubkey: auth.pubkey!,
        method: "qr",
      },
    });
    return { alreadyCheckedIn: false, checkedInAt: now };
  });

  if (result.alreadyCheckedIn) {
    return NextResponse.json({
      ok: false,
      alreadyCheckedIn: true,
      checkedInAt: result.checkedInAt,
    });
  }

  return NextResponse.json({ ok: true });
}
