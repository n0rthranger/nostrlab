import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPubkey } from "@/lib/session";
import { canManageEvent } from "@/lib/event-access";
import { hexToNpub } from "@/lib/nostr/encode";

export const dynamic = "force-dynamic";

function csv(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionPubkey = await getSessionPubkey();
  if (!sessionPubkey) return NextResponse.json({ error: "session required" }, { status: 401 });
  if (!(await canManageEvent(id, sessionPubkey))) {
    return NextResponse.json({ error: "not an organizer" }, { status: 403 });
  }

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      rsvps: { include: { user: true }, orderBy: { updatedAt: "asc" } },
      tickets: { include: { payment: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });

  const ticketsByPubkey = new Map(event.tickets.map((ticket) => [ticket.buyerPubkey, ticket]));
  const rows = [
    [
      "name",
      "npub",
      "pubkey",
      "rsvp_status",
      "private_rsvp",
      "ticket_id",
      "ticket_tier",
      "paid_sats",
      "payment_status",
      "checked_in_at",
      "rsvp_updated_at",
    ],
    ...event.rsvps.map((rsvp) => {
      const ticket = ticketsByPubkey.get(rsvp.pubkey);
      return [
        rsvp.user.displayName ?? rsvp.user.name ?? "",
        rsvp.user.npub ?? hexToNpub(rsvp.pubkey),
        rsvp.pubkey,
        rsvp.status,
        rsvp.privatePayload ? "yes" : "no",
        ticket?.id ?? "",
        ticket?.tier ?? "",
        ticket?.payment?.amountSats ?? "",
        ticket?.payment?.status ?? "",
        ticket?.checkedInAt?.toISOString() ?? "",
        rsvp.updatedAt.toISOString(),
      ];
    }),
  ];
  const body = rows.map((row) => row.map(csv).join(",")).join("\n");
  const filename = `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "event"}-attendees.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
