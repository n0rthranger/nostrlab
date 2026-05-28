import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calendarFeed, calendarResponse, requestAppUrl } from "@/lib/calendar";
import { bannedSet } from "@/lib/moderation";
import { eventModeToDb } from "@/lib/nostr/parse";
import { EVENT_MODES } from "@/lib/nostr/kinds";

export const dynamic = "force-dynamic";

function titleFor(params: URLSearchParams): string {
  const parts = ["NostrLab events"];
  const community = params.get("community");
  const city = params.get("city");
  const tag = params.get("tag");
  if (community) parts.push(community);
  if (city) parts.push(city);
  if (tag) parts.push(`#${tag}`);
  return parts.join(" - ");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const banned = await bannedSet();
  const where: Prisma.EventWhereInput = {
    duplicateOfId: null,
    startsAt: {
      gte: sp.get("from") ? new Date(sp.get("from")!) : new Date(Date.now() - 86_400_000),
      ...(sp.get("to") ? { lte: new Date(sp.get("to")!) } : {}),
    },
    ...(banned.size > 0 ? { organizerPubkey: { notIn: [...banned] } } : {}),
  };
  const and: Prisma.EventWhereInput[] = [];
  const q = sp.get("q")?.trim();
  const city = sp.get("city")?.trim();
  const tag = sp.get("tag")?.trim().toLowerCase();
  const mode = sp.get("mode");
  const paid = sp.get("paid");
  const status = sp.get("status");
  const community = sp.get("community")?.trim();

  if (status === "cancelled") where.status = "CANCELLED";
  else if (status !== "all") where.status = "ACTIVE";
  if (mode && (EVENT_MODES as readonly string[]).includes(mode)) where.mode = eventModeToDb(mode as (typeof EVENT_MODES)[number]);
  if (paid === "free") where.paymentMode = "FREE";
  if (paid === "paid") where.paymentMode = "PAID";
  if (tag) where.tags = { some: { tag } };
  if (community) where.community = { slug: community };
  if (city) {
    and.push({
      OR: [
        { city: { contains: city, mode: "insensitive" } },
        { venue: { contains: city, mode: "insensitive" } },
      ],
    });
  }
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { venue: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (and.length > 0) where.AND = and;

  const events = await prisma.event.findMany({
    where,
    orderBy: { startsAt: "asc" },
    take: 500,
  });

  return calendarResponse(
    calendarFeed({
      name: titleFor(sp),
      description: "NostrLab subscribable event feed",
      events,
      appUrl: requestAppUrl(req),
    }),
    "nostrlab-events.ics"
  );
}
