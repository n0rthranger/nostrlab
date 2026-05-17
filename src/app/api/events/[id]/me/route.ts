import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePubkey } from "@/lib/nostr/encode";
import { dbToRsvpStatus } from "@/lib/nostr/parse";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const raw = req.nextUrl.searchParams.get("pubkey");
  if (!raw) return NextResponse.json({ rsvp: null, ticket: null });

  let pubkey: string;
  try { pubkey = normalizePubkey(raw); }
  catch { return NextResponse.json({ rsvp: null, ticket: null }); }

  const [rsvp, ticket] = await Promise.all([
    prisma.rsvp.findUnique({
      where: { eventId_pubkey: { eventId: id, pubkey } },
      select: { status: true, updatedAt: true, privatePayload: true },
    }),
    prisma.ticket.findFirst({
      where: { eventId: id, buyerPubkey: pubkey },
      select: { id: true, checkedInAt: true, tier: true },
    }),
  ]);

  return NextResponse.json({
    rsvp: rsvp ? { status: dbToRsvpStatus(rsvp.status), private: !!rsvp.privatePayload } : null,
    ticket,
  });
}
