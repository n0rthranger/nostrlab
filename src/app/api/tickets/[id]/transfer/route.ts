import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionPubkey } from "@/lib/session";
import { verifyAuthEnvelope } from "@/lib/auth";
import { nostrEventSchema } from "@/lib/validation";
import { normalizePubkey } from "@/lib/nostr/encode";
import { ensureUser } from "@/lib/nostr/profile";
import { notifyPubkey } from "@/lib/notifications";

const transferSchema = z.object({
  recipientPubkey: z.string().min(1),
  signedAuthEvent: nostrEventSchema,
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionPubkey = await getSessionPubkey();
  if (!sessionPubkey) return NextResponse.json({ error: "session required" }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = transferSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  let recipientPubkey: string;
  try { recipientPubkey = normalizePubkey(parsed.data.recipientPubkey); }
  catch { return NextResponse.json({ error: "bad recipient pubkey" }, { status: 400 }); }

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { event: { select: { id: true, title: true, startsAt: true } } },
  });
  if (!ticket) return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  if (ticket.buyerPubkey !== sessionPubkey) return NextResponse.json({ error: "not ticket holder" }, { status: 403 });
  if (ticket.checkedInAt) return NextResponse.json({ error: "checked-in tickets cannot be transferred" }, { status: 409 });
  if (recipientPubkey === ticket.buyerPubkey) return NextResponse.json({ error: "recipient already owns this ticket" }, { status: 400 });
  const existingRecipientTicket = await prisma.ticket.findFirst({
    where: { eventId: ticket.eventId, buyerPubkey: recipientPubkey },
    select: { id: true },
  });
  if (existingRecipientTicket) {
    return NextResponse.json({ error: "recipient already has a ticket for this event" }, { status: 409 });
  }

  const payload = { ticketId: id, recipientPubkey };
  const auth = verifyAuthEnvelope(parsed.data.signedAuthEvent, {
    expectedAction: "ticket.transfer",
    expectedTags: { t: id },
    expectedPayload: payload,
  });
  if (!auth.ok || auth.pubkey !== sessionPubkey) {
    return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: 401 });
  }

  await ensureUser(recipientPubkey);
  const updated = await prisma.ticket.update({
    where: { id },
    data: {
      buyerPubkey: recipientPubkey,
      originalBuyerPubkey: ticket.originalBuyerPubkey ?? ticket.buyerPubkey,
      transferredAt: new Date(),
      transferCount: { increment: 1 },
    },
  });
  await notifyPubkey({
    pubkey: recipientPubkey,
    type: "TICKET_TRANSFER",
    title: `Ticket transferred: ${ticket.event.title}`,
    body: "A ticket was transferred to your Nostr key.",
    eventId: ticket.eventId,
    ticketId: ticket.id,
  });
  return NextResponse.json({ ok: true, buyerPubkey: updated.buyerPubkey });
}
