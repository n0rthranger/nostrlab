import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionPubkey } from "@/lib/session";
import { EventForm } from "@/components/events/EventForm";
import { eventModeToWire } from "@/lib/nostr/parse";

export const dynamic = "force-dynamic";

export default async function EditEventPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pubkey = await getSessionPubkey();
  if (!pubkey) notFound();

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      tags: true,
      cohosts: true,
      community: true,
    },
  });
  if (!event) notFound();
  if (event.organizerPubkey !== pubkey) notFound();

  return (
    <div className="max-w-2xl mx-auto px-5 py-12">
      <div className="mb-10">
        <Link href={`/dashboard/events/${event.id}`} className="text-sm text-muted hover:text-fg inline-flex items-center gap-1 mb-3">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Manage event
        </Link>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-[-0.025em]">Edit event</h1>
        <p className="text-muted text-lg mt-2 leading-relaxed">
          Updates are signed with the same event coordinate and re-indexed.
        </p>
      </div>
      <EventForm
        submitLabel="Publish update"
        allowRecurrence={false}
        initialEvent={{
          id: event.id,
          dTag: event.dTag,
          title: event.title,
          description: event.description,
          bannerUrl: event.bannerUrl,
          startsAt: event.startsAt.toISOString(),
          endsAt: event.endsAt?.toISOString() ?? null,
          city: event.city,
          venue: event.venue,
          geohash: event.geohash,
          mode: eventModeToWire(event.mode),
          tags: event.tags.map((t) => t.tag),
          capacity: event.capacity,
          paymentMode: event.paymentMode,
          priceSats: event.priceSats,
          cohostPubkeys: event.cohosts.map((c) => c.pubkey),
          communitySlug: event.community?.slug ?? null,
        }}
      />
    </div>
  );
}
