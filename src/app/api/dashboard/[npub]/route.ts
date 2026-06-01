import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePubkey } from "@/lib/nostr/encode";
import { communityToDTO, eventToListDTO, userToDTO } from "@/lib/dto";
import { getSessionPubkey } from "@/lib/session";
import { savedSearchHref } from "@/lib/discovery/saved-search";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ npub: string }> }
) {
  const { npub } = await params;
  let pubkey: string;
  try { pubkey = normalizePubkey(npub); } catch { return NextResponse.json({ error: "bad npub" }, { status: 400 }); }
  const sessionPubkey = await getSessionPubkey();
  if (!sessionPubkey || sessionPubkey !== pubkey) {
    return NextResponse.json({ error: "session required" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { pubkey } });
  const now = new Date();

  const [upcoming, past, rsvped, followed, notifications, savedAlerts] = await Promise.all([
    prisma.event.findMany({
      where: { organizerPubkey: pubkey, startsAt: { gte: now }, duplicateOfId: null },
      orderBy: { startsAt: "asc" },
      include: { organizer: true, tags: true, _count: { select: { rsvps: true } } },
    }),
    prisma.event.findMany({
      where: { organizerPubkey: pubkey, startsAt: { lt: now }, duplicateOfId: null },
      orderBy: { startsAt: "desc" },
      take: 20,
      include: { organizer: true, tags: true, _count: { select: { rsvps: true } } },
    }),
    prisma.rsvp.findMany({
      where: { pubkey, status: "GOING", event: { startsAt: { gte: now }, duplicateOfId: null } },
      include: {
        event: {
          include: { organizer: true, tags: true, _count: { select: { rsvps: true } } },
        },
      },
      take: 20,
    }),
    prisma.communityFollow.findMany({
      where: { pubkey },
      take: 12,
      include: {
        community: {
          include: { organizer: true, tags: true, _count: { select: { events: true, followers: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.notification.findMany({
      where: { recipientPubkey: pubkey },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { event: { select: { id: true, title: true, startsAt: true } } },
    }),
    prisma.savedEventSearch.findMany({
      where: { pubkey },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  const followedIds = followed.map((f) => f.communityId);
  const followedCounts = followedIds.length > 0
    ? await prisma.event.groupBy({
        by: ["communityId"],
        where: { communityId: { in: followedIds }, startsAt: { gte: now }, status: "ACTIVE", duplicateOfId: null },
        _count: { _all: true },
      })
    : [];
  const countMap = new Map(followedCounts.map((c) => [c.communityId!, c._count._all]));
  const attendedEventIds = new Set(rsvped.map((r) => r.eventId));
  const tagScores = new Map<string, number>();
  const cityScores = new Map<string, number>();
  for (const r of rsvped) {
    if (r.event.city) cityScores.set(r.event.city, (cityScores.get(r.event.city) ?? 0) + 1);
    for (const tag of r.event.tags) tagScores.set(tag.tag, (tagScores.get(tag.tag) ?? 0) + 1);
  }
  const topTags = [...tagScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([tag]) => tag);
  const topCities = [...cityScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([city]) => city);
  const recommendationOr: Prisma.EventWhereInput[] = [];
  if (followedIds.length > 0) recommendationOr.push({ communityId: { in: followedIds } });
  if (topTags.length > 0) recommendationOr.push({ tags: { some: { tag: { in: topTags } } } });
  if (topCities.length > 0) recommendationOr.push({ city: { in: topCities } });
  const recommendations = await prisma.event.findMany({
    where: {
      status: "ACTIVE",
      startsAt: { gte: now },
      duplicateOfId: null,
      organizerPubkey: { not: pubkey },
      ...(attendedEventIds.size > 0 ? { id: { notIn: [...attendedEventIds] } } : {}),
      ...(recommendationOr.length > 0 ? { OR: recommendationOr } : {}),
    },
    orderBy: { startsAt: "asc" },
    take: 8,
    include: { organizer: true, tags: true, _count: { select: { rsvps: true } } },
  });

  return NextResponse.json({
    user: userToDTO(user, pubkey),
    upcoming: upcoming.map(eventToListDTO),
    past: past.map(eventToListDTO),
    attending: rsvped.map((r) => eventToListDTO(r.event)),
    followedCommunities: followed.map((f) => communityToDTO(f.community, countMap.get(f.communityId) ?? 0)),
    recommendations: recommendations.map(eventToListDTO),
    savedAlerts: savedAlerts.map((alert) => ({
      id: alert.id,
      name: alert.name,
      href: savedSearchHref(alert),
      createdAt: alert.createdAt.toISOString(),
      lastNotifiedAt: alert.lastNotifiedAt?.toISOString() ?? null,
    })),
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      event: n.event ? { id: n.event.id, title: n.event.title, startsAt: n.event.startsAt.toISOString() } : null,
      ticketId: n.ticketId,
    })),
  });
}
