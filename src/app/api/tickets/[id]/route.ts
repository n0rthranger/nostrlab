import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/tickets/[id]
// Always returns a stripped non-sensitive view. QR reveal uses
// POST /api/tickets/[id]/reveal so secrets don't travel in URLs.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      event: {
        select: { id: true, title: true, startsAt: true, venue: true, city: true },
      },
    },
  });
  if (!ticket) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    id: ticket.id,
    eventId: ticket.eventId,
    tier: ticket.tier,
    tierId: ticket.tierId,
    buyerPubkey: ticket.buyerPubkey,
    originalBuyerPubkey: ticket.originalBuyerPubkey,
    checkedInAt: ticket.checkedInAt,
    transferredAt: ticket.transferredAt,
    event: ticket.event,
  });
}
