import { EventForm } from "@/components/events/EventForm";
import { prisma } from "@/lib/prisma";
import { eventModeToWire } from "@/lib/nostr/parse";

export const dynamic = "force-dynamic";

async function duplicateInitial(id: string) {
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      tags: true,
      cohosts: true,
      community: true,
    },
  });
  if (!event) return undefined;
  return {
    title: `${event.title} copy`,
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
  };
}

export default async function CreateEventPage({
  searchParams,
}: {
  searchParams?: Promise<{ duplicate?: string; community?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const initial = sp.duplicate
    ? await duplicateInitial(sp.duplicate)
    : sp.community
    ? { communitySlug: sp.community }
    : undefined;
  return (
    <div className="max-w-2xl mx-auto px-5 py-12">
      <div className="mb-10">
        <h1 className="text-4xl md:text-5xl font-semibold">Host an event</h1>
        <p className="text-muted text-lg mt-2 leading-relaxed">
          Create a clear event page, collect RSVPs, and manage tickets and check-in from your dashboard.
        </p>
      </div>
      <EventForm initialEvent={initial} />
    </div>
  );
}
