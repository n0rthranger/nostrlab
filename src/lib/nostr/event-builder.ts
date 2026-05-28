// Helpers that produce *unsigned* Nostr events ready to hand to a Nostr
// signer. Output is strictly NIP-52 compliant for kind 31923 (time-based
// calendar events) so other Nostr calendar apps render our events natively.
//
// Every event we build also carries NostrLab client/source tags so the indexer
// can distinguish NostrLab-authored events from external NIP-52 events.

import type { UnsignedEvent } from "./types";
import {
  KIND_COMMENT,
  KIND_CALENDAR_LIST,
  KIND_COMMUNITY_LIST,
  KIND_COMMUNITY_APPROVAL,
  KIND_EVENT_LISTING,
  KIND_EVENT_DELETION,
  KIND_RSVP,
  KIND_TICKET_PROOF,
  KIND_COMMUNITY,
  KIND_APP_DESCRIPTOR,
  APP_NAME,
  APP_D_TAG,
  type EventModeString,
  type RsvpStatusString,
} from "./kinds";

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function unixSec(d: Date) {
  return Math.floor(d.getTime() / 1000);
}

function dayTag(d: Date) {
  return String(Math.floor(unixSec(d) / 86_400));
}

function dateCoverageTags(startsAt: Date, endsAt?: Date): string[][] {
  const startDay = Number(dayTag(startsAt));
  const endDay = endsAt
    ? Math.floor((unixSec(endsAt) - 1) / 86_400)
    : startDay;
  if (!Number.isFinite(startDay) || !Number.isFinite(endDay) || endDay < startDay) {
    return [["D", String(startDay)]];
  }
  const days = Math.min(endDay - startDay + 1, 370);
  return Array.from({ length: days }, (_, i) => ["D", String(startDay + i)]);
}

/**
 * Returns the NIP-89 client tag ([client, nostrlab, 31990:<app-pubkey>:nostrlab])
 * if the public app pubkey is configured, else null.
 *
 * Resolves both server-side (full process.env) and client-side (Next.js
 * inlines NEXT_PUBLIC_*).
 */
function clientTag(): string[] | null {
  const pk = process.env.NEXT_PUBLIC_NOSTRLAB_APP_PUBKEY;
  if (!pk || !/^[0-9a-f]{64}$/i.test(pk)) return null;
  return ["client", APP_NAME, `${KIND_APP_DESCRIPTOR}:${pk.toLowerCase()}:${APP_D_TAG}`];
}

function withClientTag(tags: string[][]): string[][] {
  const ct = clientTag();
  if (ct) tags.push(ct);
  // soft hashtag for global Nostr search ("#nostrlab")
  tags.push(["t", APP_NAME]);
  return tags;
}

export interface EventListingInput {
  pubkey: string;          // organizer hex pubkey
  dTag: string;            // stable slug — replaceable identity
  title: string;
  description: string;
  summary?: string;        // NIP-52 short description (optional)
  bannerUrl?: string;
  startsAt: Date;
  endsAt?: Date;
  tzid?: string;           // IANA timezone (e.g. "America/Chicago")
  city?: string;
  venue?: string;
  geohash?: string;
  mode: EventModeString;
  tags: string[];
  capacity?: number;
  priceSats?: number;
  cohostPubkeys?: string[];
  communitySlug?: string;
  communityOwnerPubkey?: string;
  recurrenceGroupId?: string;
  recurrenceIndex?: number;
  recurrenceFrequency?: "weekly" | "monthly";
}

function uniquePubkeys(pubkeys: string[]): string[] {
  return Array.from(new Set(pubkeys.map((p) => p.toLowerCase()).filter(Boolean)));
}

export function buildEventListing(input: EventListingInput): UnsignedEvent {
  const tags: string[][] = [
    ["d", input.dTag],
    ["title", input.title],
    ["start", String(unixSec(input.startsAt))],
    ...dateCoverageTags(input.startsAt, input.endsAt),
  ];

  // Default to the browser's local timezone if the caller didn't specify.
  const tzid =
    input.tzid ??
    (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined);
  if (tzid) tags.push(["start_tzid", tzid]);

  if (input.endsAt) {
    tags.push(["end", String(unixSec(input.endsAt))]);
    if (tzid) tags.push(["end_tzid", tzid]);
  }

  if (input.summary) tags.push(["summary", input.summary]);
  if (input.bannerUrl) tags.push(["image", input.bannerUrl]);

  // NIP-52 supports multiple location tags; we list venue then city for
  // strict→broad ordering. Other clients display them in order.
  if (input.venue) tags.push(["location", input.venue]);
  if (input.city) tags.push(["location", input.city]);

  if (input.geohash) tags.push(["g", input.geohash]);

  // NostrLab extensions — non-conflicting tag names other clients can ignore.
  tags.push(["mode", input.mode]);
  if (input.capacity) tags.push(["capacity", String(input.capacity)]);
  if (input.priceSats && input.priceSats > 0) {
    tags.push(["price", String(input.priceSats), "sats"]);
  }
  if (input.recurrenceGroupId) tags.push(["recurrence_group", input.recurrenceGroupId]);
  if (input.recurrenceIndex !== undefined) tags.push(["recurrence_index", String(input.recurrenceIndex)]);
  if (input.recurrenceFrequency) tags.push(["recurrence_frequency", input.recurrenceFrequency]);

  // Hashtags
  for (const t of input.tags) {
    if (t.trim()) tags.push(["t", t.trim().toLowerCase()]);
  }

  // Co-hosts as `p` tags with role per NIP-52 convention
  for (const co of input.cohostPubkeys ?? []) {
    tags.push(["p", co, "", "host"]);
  }

  if (input.communitySlug) {
    const owner = input.communityOwnerPubkey ?? input.pubkey;
    tags.push(["a", `${KIND_COMMUNITY}:${owner}:${input.communitySlug}`]);
    tags.push(["a", `${KIND_CALENDAR_LIST}:${owner}:${input.communitySlug}`]);
  }

  return {
    pubkey: input.pubkey,
    kind: KIND_EVENT_LISTING,
    created_at: nowSec(),
    content: input.description,
    tags: withClientTag(tags),
  };
}

export interface CommunityDefinitionInput {
  pubkey: string;
  slug: string;
  name: string;
  description: string;
  imageUrl?: string | null;
  website?: string | null;
  tags?: string[];
  moderatorPubkeys?: string[];
  relays?: string[];
}

export function buildCommunityDefinition(input: CommunityDefinitionInput): UnsignedEvent {
  const tags: string[][] = [
    ["d", input.slug],
    ["name", input.name],
    ["description", input.description],
  ];

  if (input.imageUrl) tags.push(["image", input.imageUrl]);
  if (input.website) tags.push(["r", input.website]);

  for (const tag of input.tags ?? []) {
    if (tag.trim()) tags.push(["t", tag.trim().toLowerCase()]);
  }

  for (const pubkey of uniquePubkeys([input.pubkey, ...(input.moderatorPubkeys ?? [])])) {
    tags.push(["p", pubkey, "", "moderator"]);
  }

  for (const relay of input.relays ?? []) {
    tags.push(["relay", relay]);
  }

  return {
    pubkey: input.pubkey,
    kind: KIND_COMMUNITY,
    created_at: nowSec(),
    content: input.description,
    tags: withClientTag(tags),
  };
}

export interface CalendarListInput {
  pubkey: string;
  dTag: string;
  title: string;
  description: string;
  eventCoordinates?: string[];
}

export function buildCalendarList(input: CalendarListInput): UnsignedEvent {
  const tags: string[][] = [
    ["d", input.dTag],
    ["title", input.title],
  ];
  for (const coord of Array.from(new Set(input.eventCoordinates ?? [])).sort()) {
    if (coord.startsWith(`${KIND_EVENT_LISTING}:`)) tags.push(["a", coord]);
  }
  return {
    pubkey: input.pubkey,
    kind: KIND_CALENDAR_LIST,
    created_at: nowSec(),
    content: input.description,
    tags: withClientTag(tags),
  };
}

export interface EventDeletionInput {
  pubkey: string;
  eventId: string;
  eventCoordinate: string;
  reason?: string | null;
}

export function buildEventDeletion(input: EventDeletionInput): UnsignedEvent {
  return {
    pubkey: input.pubkey,
    kind: KIND_EVENT_DELETION,
    created_at: nowSec(),
    content: input.reason?.trim() ?? "",
    tags: withClientTag([
      ["e", input.eventId],
      ["a", input.eventCoordinate],
      ["k", String(KIND_EVENT_LISTING)],
      ["alt", "This event has been deleted by its organizer."],
    ]),
  };
}

export interface RsvpInput {
  pubkey: string;
  eventCoordinate: string; // "31923:<organizerPubkey>:<dTag>"
  organizerPubkey: string;
  status: RsvpStatusString;
  note?: string;
  /** Stable per-event-per-user d tag, so RSVPs are replaceable in place. */
  dTag: string;
}

export function buildRsvp(input: RsvpInput): UnsignedEvent {
  // NIP-52: `fb` (free/busy) is "busy" only if accepted; "free" otherwise.
  const fb = input.status === "accepted" ? "busy" : "free";
  return {
    pubkey: input.pubkey,
    kind: KIND_RSVP,
    created_at: nowSec(),
    content: input.note ?? "",
    tags: withClientTag([
      ["a", input.eventCoordinate],
      ["d", input.dTag],
      ["status", input.status],
      ["fb", fb],
      ["p", input.organizerPubkey],
    ]),
  };
}

export interface EventCommentInput {
  pubkey: string;
  eventCoordinate: string;
  organizerPubkey: string;
  eventNostrId?: string | null;
  content: string;
}

function eventCommentTags(input: Omit<EventCommentInput, "pubkey" | "content">): string[][] {
  const tags: string[][] = [
    ["A", input.eventCoordinate],
    ["K", String(KIND_EVENT_LISTING)],
    ["P", input.organizerPubkey],
    ["a", input.eventCoordinate],
    ["k", String(KIND_EVENT_LISTING)],
    ["p", input.organizerPubkey],
  ];
  if (input.eventNostrId) tags.push(["e", input.eventNostrId]);
  return tags;
}

export function buildEventComment(input: EventCommentInput): UnsignedEvent {
  return {
    pubkey: input.pubkey,
    kind: KIND_COMMENT,
    created_at: nowSec(),
    content: input.content,
    tags: withClientTag(eventCommentTags(input)),
  };
}

export interface EventAnnouncementInput extends EventCommentInput {
  title: string;
}

export function buildEventAnnouncement(input: EventAnnouncementInput): UnsignedEvent {
  return {
    pubkey: input.pubkey,
    kind: KIND_COMMENT,
    created_at: nowSec(),
    content: input.content,
    tags: withClientTag([
      ...eventCommentTags(input),
      ["t", "announcement"],
      ["title", input.title],
      ["subject", input.title],
    ]),
  };
}

export interface CommunityListInput {
  pubkey: string;
  communityCoordinates: string[];
}

export function buildCommunityList(input: CommunityListInput): UnsignedEvent {
  const coordinates = Array.from(new Set(input.communityCoordinates))
    .filter((coord) => coord.startsWith(`${KIND_COMMUNITY}:`))
    .sort();
  const tags = coordinates.map((coord) => ["a", coord]);
  const ct = clientTag();
  if (ct) tags.push(ct);
  return {
    pubkey: input.pubkey,
    kind: KIND_COMMUNITY_LIST,
    created_at: nowSec(),
    content: "",
    tags,
  };
}

export interface CommunityPostInput {
  pubkey: string;
  communityCoordinate: string;
  communityOwnerPubkey: string;
  content: string;
}

export function buildCommunityPost(input: CommunityPostInput): UnsignedEvent {
  return {
    pubkey: input.pubkey,
    kind: KIND_COMMENT,
    created_at: nowSec(),
    content: input.content,
    tags: withClientTag([
      ["A", input.communityCoordinate],
      ["K", String(KIND_COMMUNITY)],
      ["P", input.communityOwnerPubkey],
      ["a", input.communityCoordinate],
      ["k", String(KIND_COMMUNITY)],
      ["p", input.communityOwnerPubkey],
    ]),
  };
}

export interface CommunityPostApprovalInput {
  pubkey: string;
  communityCoordinate: string;
  postId: string;
  postAuthorPubkey: string;
  postKind?: number;
  rawPostEvent?: unknown;
}

export function buildCommunityPostApproval(input: CommunityPostApprovalInput): UnsignedEvent {
  return {
    pubkey: input.pubkey,
    kind: KIND_COMMUNITY_APPROVAL,
    created_at: nowSec(),
    content: input.rawPostEvent ? JSON.stringify(input.rawPostEvent) : "",
    tags: withClientTag([
      ["a", input.communityCoordinate],
      ["e", input.postId],
      ["p", input.postAuthorPubkey],
      ["k", String(input.postKind ?? KIND_COMMENT)],
    ]),
  };
}

export interface TicketProofInput {
  pubkey: string;          // NostrLab app issuer
  ticketId: string;
  eventId: string;
  eventNostrId?: string;
  eventCoordinate: string;
  buyerPubkey: string;
  tier: string;
  secretHash: string;
  paymentHash?: string;
  paymentProvider?: string;
  amountSats?: number;
  content: string;
}

export function buildTicketProof(input: TicketProofInput): UnsignedEvent {
  const tags = [
    ["d", input.ticketId],
    ["ticket", input.ticketId],
    ["event_id", input.eventId],
    ["a", input.eventCoordinate],
    ["p", input.buyerPubkey],
    ["tier", input.tier],
    ["secret_hash", input.secretHash],
  ];
  if (input.eventNostrId) tags.push(["e", input.eventNostrId]);
  if (input.paymentHash) tags.push(["payment_hash", input.paymentHash]);
  if (input.paymentProvider) tags.push(["payment_provider", input.paymentProvider]);
  if (input.amountSats !== undefined) tags.push(["amount", String(input.amountSats), "sats"]);

  return {
    pubkey: input.pubkey,
    kind: KIND_TICKET_PROOF,
    created_at: nowSec(),
    content: input.content,
    tags: withClientTag(tags),
  };
}

export function eventCoordinate(organizerPubkey: string, dTag: string): string {
  return `${KIND_EVENT_LISTING}:${organizerPubkey}:${dTag}`;
}

export function calendarCoordinate(ownerPubkey: string, dTag: string): string {
  return `${KIND_CALENDAR_LIST}:${ownerPubkey}:${dTag}`;
}

export function communityCoordinate(ownerPubkey: string, dTag: string): string {
  return `${KIND_COMMUNITY}:${ownerPubkey}:${dTag}`;
}

/** Deterministic d-tag for RSVPs so they're replaceable per (user, event). */
export function rsvpDTag(eventCoordinate: string): string {
  return `rsvp:${eventCoordinate}`;
}
