import { z } from "zod";
import { EVENT_MODES, RSVP_STATUSES } from "@/lib/nostr/kinds";
import { EVENT_CATEGORY_SLUGS } from "@/lib/event-categories";

const hex64 = z.string().regex(/^[0-9a-f]{64}$/i);
const imageUrl = z.string().max(2048).refine(
  (s) => s.startsWith("/uploads/") || /^https?:\/\//i.test(s),
  "image URL must be http(s) or a local upload"
);
const websiteUrl = z.string().max(2048).url().refine(
  (s) => /^https:\/\//i.test(s),
  "website must be an HTTPS URL"
);

export const nostrEventSchema = z.object({
  id: hex64,
  pubkey: hex64,
  kind: z.number().int().nonnegative(),
  created_at: z.number().int(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  sig: z.string().regex(/^[0-9a-f]{128}$/i),
});

export const eventCreateSchema = z.object({
  signedEvent: nostrEventSchema,
});

export const rsvpCreateSchema = z.object({
  signedEvent: nostrEventSchema,
});

export const privateRsvpCreateSchema = z.object({
  signedAuthEvent: nostrEventSchema,
  status: z.enum(RSVP_STATUSES),
  private: z.literal(true),
});

export const eventFilterSchema = z.object({
  city: z.string().optional(),
  tag: z.string().optional(),
  category: z.enum(EVENT_CATEGORY_SLUGS).optional(),
  q: z.string().optional(),
  mode: z.enum(EVENT_MODES).optional(),
  paid: z.enum(["free", "paid"]).optional(),
  status: z.enum(["active", "cancelled", "all"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().int().min(1).max(500).default(50),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.string().optional(),
});

export const invoiceCreateSchema = z.object({
  eventId: z.string(),
  buyerPubkey: hex64,
  tierId: z.string().optional(),
});

export const checkInSchema = z.object({
  ticketSecret: z.string().min(8),
  ticketProof: nostrEventSchema.optional(),
  paymentPreimage: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  signedAuthEvent: nostrEventSchema,
});

export const communityCreateSchema = z.object({
  signedAuthEvent: nostrEventSchema,
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(80),
  description: z.string().max(2000),
  imageUrl: imageUrl.nullable().optional(),
  website: websiteUrl.nullable().optional(),
  tags: z.array(z.string().min(1).max(30)).max(10).default([]),
  moderators: z.array(hex64).max(20).default([]),
});

export const communityUpdateSchema = z.object({
  signedAuthEvent: nostrEventSchema,
  name: z.string().min(2).max(80),
  description: z.string().max(2000),
  imageUrl: imageUrl.nullable().optional(),
  website: websiteUrl.nullable().optional(),
  tags: z.array(z.string().min(1).max(30)).max(10).default([]),
  moderators: z.array(hex64).max(20).default([]),
  transferPubkey: hex64.nullable().optional(),
});

export const waitlistPromoteSchema = z.object({
  signedAuthEvent: nostrEventSchema,
  pubkey: hex64.optional(),
});

export const ticketRecoverSchema = z.object({
  signedAuthEvent: nostrEventSchema,
});

export const banPubkeySchema = z.object({
  signedAuthEvent: nostrEventSchema,
  pubkey: hex64,
  reason: z.string().max(500).nullable().optional(),
});
