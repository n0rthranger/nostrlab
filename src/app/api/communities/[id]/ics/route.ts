import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calendarFeed, calendarResponse, requestAppUrl } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: slug } = await params;
  const community = await prisma.community.findUnique({
    where: { slug },
    include: {
      events: {
        where: {
          duplicateOfId: null,
          status: "ACTIVE",
          startsAt: { gte: new Date(Date.now() - 86_400_000) },
        },
        orderBy: { startsAt: "asc" },
        take: 500,
      },
    },
  });
  if (!community) return NextResponse.json({ error: "community not found" }, { status: 404 });

  return calendarResponse(
    calendarFeed({
      name: `${community.name} - NostrLab`,
      description: community.description,
      events: community.events,
      appUrl: requestAppUrl(req),
    }),
    `${community.slug}.ics`
  );
}
