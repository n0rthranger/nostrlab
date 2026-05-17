// Shared DTOs the API returns to the client. Keeps server (Prisma types) and
// client (any) loosely coupled.

export interface UserDTO {
  pubkey: string;
  npub: string;
  displayName?: string | null;
  name?: string | null;
  picture?: string | null;
  about?: string | null;
  nip05?: string | null;
  lud16?: string | null;
}

export interface EventListItemDTO {
  id: string;
  nostrId: string;
  title: string;
  bannerUrl?: string | null;
  startsAt: string;
  endsAt?: string | null;
  timezone?: string | null;
  city?: string | null;
  venue?: string | null;
  geohash?: string | null;
  mode: "ONLINE" | "OFFLINE" | "HYBRID";
  status: "ACTIVE" | "CANCELLED";
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  paymentMode: "FREE" | "PAID";
  priceSats?: number | null;
  tags: string[];
  organizer: UserDTO;
  rsvpCount: number;
  capacity?: number | null;
}

export interface TicketTierDTO {
  id: string;
  name: string;
  description?: string | null;
  priceSats: number;
  quantity?: number | null;
  salesStartAt?: string | null;
  salesEndAt?: string | null;
  soldCount?: number;
}

export interface EventDetailDTO extends EventListItemDTO {
  description: string;
  cohosts: UserDTO[];
  rsvpsByStatus: Record<"GOING" | "MAYBE" | "NOT_GOING" | "WAITLIST", number>;
  recentRsvps: { user: UserDTO; status: string; at: string }[];
  ticketTiers: TicketTierDTO[];
  organizerStats: {
    eventsCreated: number;
    pastAttendees: number;
    profileAgeDays: number | null;
  };
}

export interface CommunityDTO {
  id: string;
  slug: string;
  name: string;
  description: string;
  imageUrl?: string | null;
  website?: string | null;
  verifiedAt?: string | null;
  verifiedMethod?: string | null;
  organizer: UserDTO;
  tags: string[];
  upcomingCount: number;
  followerCount: number;
}
