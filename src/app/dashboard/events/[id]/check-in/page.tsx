import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CheckInScanner } from "@/components/tickets/CheckInScanner";
import { getSessionPubkey } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CheckInPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pubkey = await getSessionPubkey();
  if (!pubkey) notFound();

  const access = await prisma.event.findUnique({
    where: { id },
    select: {
      organizerPubkey: true,
      cohosts: { select: { pubkey: true } },
    },
  });
  if (!access) notFound();
  const allowed = access.organizerPubkey === pubkey || access.cohosts.some((c) => c.pubkey === pubkey);
  if (!allowed) notFound();

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      _count: { select: { tickets: true, checkIns: true } },
      cohosts: true,
    },
  });
  if (!event) notFound();

  return (
    <div className="max-w-2xl mx-auto px-5 py-10 space-y-6">
      <div>
        <Link href={`/dashboard/events/${event.id}`} className="text-sm text-muted hover:text-fg inline-flex items-center gap-1 mb-3">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Manage event
        </Link>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.025em] leading-tight">
          Check-in
        </h1>
        <p className="text-muted mt-2">
          {event.title} · {event._count.checkIns} of {event._count.tickets} admitted
        </p>
      </div>

      <CheckInScanner
        eventId={event.id}
        organizerPubkey={event.organizerPubkey}
        cohostPubkeys={event.cohosts.map((c) => c.pubkey)}
      />
    </div>
  );
}
