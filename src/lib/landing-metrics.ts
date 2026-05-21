import type { Prisma } from "@prisma/client";
import { bannedSet } from "@/lib/moderation";
import { prisma } from "@/lib/prisma";

export type LandingMetrics = {
  totalUpcoming: number;
  totalCommunities: number;
  totalRsvps: number;
};

export async function getLandingEventWhere(now = new Date()): Promise<Prisma.EventWhereInput> {
  const banned = await bannedSet();
  return {
    startsAt: { gte: now },
    status: "ACTIVE",
    duplicateOfId: null,
    ...(banned.size > 0 ? { organizerPubkey: { notIn: [...banned] } } : {}),
  };
}

export async function getLandingMetrics(eventWhere?: Prisma.EventWhereInput): Promise<LandingMetrics> {
  const where = eventWhere ?? await getLandingEventWhere();
  const [totalUpcoming, totalCommunities, totalRsvps] = await Promise.all([
    prisma.event.count({ where }),
    prisma.community.count(),
    prisma.rsvp.count({ where: { event: where } }),
  ]);

  return {
    totalUpcoming,
    totalCommunities,
    totalRsvps,
  };
}
