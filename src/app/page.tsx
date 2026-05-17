import { prisma } from "@/lib/prisma";
import { eventToListDTO } from "@/lib/dto";
import { LandingPage } from "@/components/home/LandingPage";
import { bannedSet } from "@/lib/moderation";

export const dynamic = "force-dynamic";

async function getData() {
  const banned = await bannedSet();
  const where = {
    startsAt: { gte: new Date() },
    status: "ACTIVE" as const,
    ...(banned.size > 0 ? { organizerPubkey: { notIn: [...banned] } } : {}),
  };
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [upcomingRows, totalCommunities, totalRsvps24h] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { startsAt: "asc" },
      take: 200,
      include: { organizer: true, tags: true, _count: { select: { rsvps: true } } },
    }),
    prisma.community.count(),
    prisma.rsvp.count({ where: { createdAt: { gte: since24h } } }),
  ]);

  return {
    upcoming: upcomingRows.map(eventToListDTO),
    totalCommunities,
    totalRsvps: totalRsvps24h,
  };
}

export default async function HomePage() {
  const { upcoming, totalCommunities, totalRsvps } = await getData();
  return (
    <LandingPage
      upcoming={upcoming}
      totalCommunities={totalCommunities}
      totalRsvps={totalRsvps}
    />
  );
}
