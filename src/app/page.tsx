import { prisma } from "@/lib/prisma";
import { eventToListDTO } from "@/lib/dto";
import { LandingPage } from "@/components/home/LandingPage";
import { getLandingEventWhere, getLandingMetrics } from "@/lib/landing-metrics";

export const dynamic = "force-dynamic";

const LANDING_EVENT_PREVIEW_LIMIT = 200;

async function getData() {
  const where = await getLandingEventWhere();

  const [upcomingRows, metrics] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { startsAt: "asc" },
      take: LANDING_EVENT_PREVIEW_LIMIT,
      include: { organizer: true, tags: true, _count: { select: { rsvps: true } } },
    }),
    getLandingMetrics(where),
  ]);

  return {
    upcoming: upcomingRows.map(eventToListDTO),
    ...metrics,
  };
}

export default async function HomePage() {
  const { upcoming, totalUpcoming, totalCommunities, totalRsvps } = await getData();
  return (
    <LandingPage
      upcoming={upcoming}
      totalUpcoming={totalUpcoming}
      totalCommunities={totalCommunities}
      totalRsvps={totalRsvps}
    />
  );
}
