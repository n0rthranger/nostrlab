// Mappers from Prisma rows → API DTOs. Keep one place to edit when shape drifts.

import type { Prisma, User } from "@prisma/client";
import { hexToNpub } from "@/lib/nostr/encode";
import type { EventDetailDTO, EventListItemDTO, UserDTO, CommunityDTO, TicketTierDTO } from "@/types";

type UserRow = User;

export function userToDTO(u: UserRow | null | undefined, fallbackPubkey?: string): UserDTO {
  if (!u && !fallbackPubkey) throw new Error("user required");
  if (!u && fallbackPubkey) {
    return { pubkey: fallbackPubkey, npub: hexToNpub(fallbackPubkey) };
  }
  return {
    pubkey: u!.pubkey,
    npub: u!.npub,
    displayName: u!.displayName,
    name: u!.name,
    picture: u!.picture,
    about: u!.about,
    nip05: u!.nip05,
    lud16: u!.lud16,
  };
}

type EventListRow = Prisma.EventGetPayload<{
  include: {
    organizer: true;
    tags: true;
    _count: { select: { rsvps: true } };
  };
}>;

export function eventToListDTO(e: EventListRow): EventListItemDTO {
  return {
    id: e.id,
    nostrId: e.nostrId,
    title: e.title,
    bannerUrl: e.bannerUrl,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt?.toISOString() ?? null,
    timezone: e.timezone,
    city: e.city,
    venue: e.venue,
    geohash: e.geohash,
    mode: e.mode,
    status: e.status,
    cancelledAt: e.cancelledAt?.toISOString() ?? null,
    cancellationReason: e.cancellationReason,
    paymentMode: e.paymentMode,
    priceSats: e.priceSats,
    capacity: e.capacity,
    tags: e.tags.map((t) => t.tag),
    organizer: userToDTO(e.organizer),
    rsvpCount: e._count.rsvps,
  };
}

type EventDetailRow = Prisma.EventGetPayload<{
  include: {
    organizer: true;
    tags: true;
    cohosts: { include: { user: true } };
    ticketTiers: {
      include: {
        _count: { select: { tickets: true } };
      };
      orderBy: { priceSats: "asc" };
    };
    rsvps: {
      include: { user: true };
      orderBy: { updatedAt: "desc" };
    };
    _count: { select: { rsvps: true } };
  };
}>;

export function ticketTierToDTO(t: {
  id: string;
  name: string;
  description: string | null;
  priceSats: number;
  quantity: number | null;
  salesStartAt: Date | null;
  salesEndAt: Date | null;
  _count?: { tickets: number };
}): TicketTierDTO {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    priceSats: t.priceSats,
    quantity: t.quantity,
    salesStartAt: t.salesStartAt?.toISOString() ?? null,
    salesEndAt: t.salesEndAt?.toISOString() ?? null,
    soldCount: t._count?.tickets ?? 0,
  };
}

export function eventToDetailDTO(
  e: EventDetailRow,
  organizerStats: EventDetailDTO["organizerStats"]
): EventDetailDTO {
  const rsvpsByStatus = { GOING: 0, MAYBE: 0, NOT_GOING: 0, WAITLIST: 0 };
  for (const r of e.rsvps) rsvpsByStatus[r.status]++;
  const publicRsvps = e.rsvps.filter((r) => !r.privatePayload);
  return {
    ...eventToListDTO(e),
    description: e.description,
    cohosts: e.cohosts.map((c) => userToDTO(c.user)),
    rsvpsByStatus,
    recentRsvps: publicRsvps.slice(0, 16).map((r) => ({
      user: userToDTO(r.user),
      status: r.status,
      at: r.updatedAt.toISOString(),
    })),
    ticketTiers: e.ticketTiers.map(ticketTierToDTO),
    organizerStats,
  };
}

type CommunityRow = Prisma.CommunityGetPayload<{
  include: {
    organizer: true;
    tags: true;
    _count: { select: { events: true; followers: true } };
  };
}>;

export function communityToDTO(c: CommunityRow, upcomingCount: number): CommunityDTO {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    imageUrl: c.imageUrl,
    website: c.website,
    verifiedAt: c.verifiedAt?.toISOString() ?? null,
    verifiedMethod: c.verifiedMethod,
    tags: c.tags.map((t) => t.tag),
    organizer: userToDTO(c.organizer),
    upcomingCount,
    followerCount: c._count.followers,
  };
}
