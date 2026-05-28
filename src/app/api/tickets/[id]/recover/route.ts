import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ticketRecoverSchema } from "@/lib/validation";
import { authEventForRequest, verifyAuthEnvelope } from "@/lib/auth";
import { canManageEvent } from "@/lib/event-access";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = ticketRecoverSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const payload = { ticketId: id };
  const authEvent = authEventForRequest(req, parsed.data.signedAuthEvent);
  if (!authEvent) return NextResponse.json({ error: "missing auth event" }, { status: 401 });
  const auth = verifyAuthEnvelope(authEvent, {
    expectedAction: "ticket.recover",
    expectedTags: { t: id },
    expectedPayload: payload,
    request: req,
  });
  if (!auth.ok || !auth.pubkey) return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: 401 });

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      buyer: true,
      event: { select: { id: true, title: true } },
    },
  });
  if (!ticket) return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  if (!(await canManageEvent(ticket.eventId, auth.pubkey))) {
    return NextResponse.json({ error: "not an organizer" }, { status: 403 });
  }

  return NextResponse.json({
    ticketId: ticket.id,
    eventId: ticket.eventId,
    eventTitle: ticket.event.title,
    buyerPubkey: ticket.buyerPubkey,
    buyerNpub: ticket.buyer.npub,
    ticketUrl: `/tickets/${ticket.id}#secret=${encodeURIComponent(ticket.secret)}`,
    checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
  });
}
