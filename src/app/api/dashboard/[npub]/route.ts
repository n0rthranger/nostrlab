import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePubkey } from "@/lib/nostr/encode";
import { communityToDTO, eventToListDTO, userToDTO } from "@/lib/dto";
import { getSessionPubkey } from "@/lib/session";

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

  const [upcoming, past, rsvped, followed, notifications] = await Promise.all([
    prisma.event.findMany({
      where: { organizerPubkey: pubkey, startsAt: { gte: new Date() }, duplicateOfId: null },
      orderBy: { startsAt: "asc" },
      include: { organizer: true, tags: true, _count: { select: { rsvps: true } } },
    }),
    prisma.event.findMany({
      where: { organizerPubkey: pubkey, startsAt: { lt: new Date() }, duplicateOfId: null },
      orderBy: { startsAt: "desc" },
      take: 20,
      include: { organizer: true, tags: true, _count: { select: { rsvps: true } } },
    }),
    prisma.rsvp.findMany({
      where: { pubkey, status: "GOING", event: { startsAt: { gte: new Date() }, duplicateOfId: null } },
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
  ]);
  const followedIds = followed.map((f) => f.communityId);
  const followedCounts = followedIds.length > 0
    ? await prisma.event.groupBy({
        by: ["communityId"],
        where: { communityId: { in: followedIds }, startsAt: { gte: new Date() }, status: "ACTIVE", duplicateOfId: null },
        _count: { _all: true },
      })
    : [];
  const countMap = new Map(followedCounts.map((c) => [c.communityId!, c._count._all]));

  return NextResponse.json({
    user: userToDTO(user, pubkey),
    upcoming: upcoming.map(eventToListDTO),
    past: past.map(eventToListDTO),
    attending: rsvped.map((r) => eventToListDTO(r.event)),
    followedCommunities: followed.map((f) => communityToDTO(f.community, countMap.get(f.communityId) ?? 0)),
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
