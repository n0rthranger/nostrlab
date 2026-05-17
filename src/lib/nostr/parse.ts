// Parse a signed Nostr event back into the shape we want to write to Postgres.
// Tolerant: missing optional tags are fine; missing required tags throw.
// Strict NIP-52 reader for kind 31923 (time-based calendar events).

import type { NostrEvent } from "./types";
import { getTagValue, getMultiTag } from "./verify";
import {
  KIND_EVENT_LISTING,
  KIND_RSVP,
  RSVP_STATUSES,
  EVENT_MODES,
  APP_NAME,
  type EventModeString,
  type RsvpStatusString,
} from "./kinds";
import { parseNostrCoordinate } from "./coordinates";

export interface ParsedEventListing {
  nostrId: string;
  organizerPubkey: string;
  dTag: string;
  title: string;
  summary?: string;
  description: string;
  bannerUrl?: string;
  startsAt: Date;
  endsAt?: Date;
  tzid?: string;
  city?: string;
  venue?: string;
  geohash?: string;
  mode: EventModeString;
  hashtags: string[];
  capacity?: number;
  priceSats?: number;
  cohostPubkeys: string[];
  clientTag: string | null; // "nostrlab" if we tagged it; null otherwise
  communityCoordinate?: string;
  recurrenceGroupId?: string;
  recurrenceIndex?: number;
  recurrenceFrequency?: "weekly" | "monthly";
}

function parseUnixOrIso(s: string): Date {
  if (/^\d+$/.test(s)) {
    const sec = Number(s);
    if (!Number.isFinite(sec) || sec <= 0) throw new Error("invalid unix timestamp");
    return new Date(sec * 1000);
  }
  // Tolerate ISO timestamps from older clients
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error("invalid timestamp");
  return d;
}

export function parseEventListing(evt: NostrEvent): ParsedEventListing {
  if (evt.kind !== KIND_EVENT_LISTING) throw new Error(`wrong kind: ${evt.kind}`);
  const dTag = getTagValue(evt, "d");
  const title = getTagValue(evt, "title");
  const start = getTagValue(evt, "start");
  if (!dTag || !title || !start) throw new Error("event missing required tags");

  const startsAt = parseUnixOrIso(start);
  const endRaw = getTagValue(evt, "end");
  const endsAt = endRaw ? parseUnixOrIso(endRaw) : undefined;
  const tzid = getTagValue(evt, "start_tzid") ?? getTagValue(evt, "end_tzid");

  const modeRaw = getTagValue(evt, "mode") ?? "offline";
  const mode = (EVENT_MODES as readonly string[]).includes(modeRaw)
    ? (modeRaw as EventModeString)
    : "offline";

  const priceTag = evt.tags.find((t) => t[0] === "price");
  const priceSats = priceTag ? Number(priceTag[1]) : undefined;
  const capacityRaw = getTagValue(evt, "capacity");
  const capacity = capacityRaw ? Number(capacityRaw) : undefined;
  const recurrenceIndexRaw = getTagValue(evt, "recurrence_index");
  const recurrenceIndex = recurrenceIndexRaw ? Number(recurrenceIndexRaw) : undefined;
  const recurrenceFrequencyRaw = getTagValue(evt, "recurrence_frequency");
  const recurrenceFrequency = recurrenceFrequencyRaw === "weekly" || recurrenceFrequencyRaw === "monthly"
    ? recurrenceFrequencyRaw
    : undefined;

  // Co-hosts: NIP-52 `p` tag with role marker. Treat any `p` with role != ""
  // as a co-host. Filter the buyer-only `p` tags out (those don't appear on
  // event listings, only on RSVP/ticket events).
  const cohostPubkeys = evt.tags
    .filter((t) => t[0] === "p" && (t[3] === "host" || t[3] === "co-host"))
    .map((t) => t[1])
    .filter(Boolean);

  // Locations: NIP-52 allows multiple. We treat the first as venue, second
  // as city (matching what the form writes).
  const locations = evt.tags.filter((t) => t[0] === "location").map((t) => t[1]).filter(Boolean);
  const venue = locations[0];
  const city = locations[1];

  // Find a community `a` tag (kind:34550)
  const communityCoordinate = evt.tags
    .find((t) => t[0] === "a" && t[1]?.startsWith("34550:"))
    ?.[1];

  // NIP-89 client tag — readable identifier so we can isolate our own events.
  const clientTag = evt.tags.find((t) => t[0] === "client")?.[1] ?? null;

  return {
    nostrId: evt.id,
    organizerPubkey: evt.pubkey,
    dTag,
    title,
    summary: getTagValue(evt, "summary"),
    description: evt.content,
    bannerUrl: getTagValue(evt, "image"),
    startsAt,
    endsAt,
    tzid,
    city,
    venue,
    geohash: getTagValue(evt, "g"),
    mode,
    hashtags: getMultiTag(evt, "t").filter((t) => t !== APP_NAME),
    capacity: Number.isFinite(capacity) ? capacity : undefined,
    priceSats: Number.isFinite(priceSats) ? priceSats : undefined,
    cohostPubkeys,
    clientTag,
    communityCoordinate,
    recurrenceGroupId: getTagValue(evt, "recurrence_group"),
    recurrenceIndex: Number.isFinite(recurrenceIndex) ? recurrenceIndex : undefined,
    recurrenceFrequency,
  };
}

export interface ParsedRsvp {
  nostrId: string;
  pubkey: string;
  eventCoordinate: string;
  organizerPubkey?: string;
  status: RsvpStatusString;
  note: string;
  clientTag: string | null;
}

export function parseRsvp(evt: NostrEvent): ParsedRsvp {
  if (evt.kind !== KIND_RSVP) throw new Error(`wrong kind: ${evt.kind}`);
  const aTag = evt.tags.find((t) => t[0] === "a")?.[1];
  const status = getTagValue(evt, "status");
  if (!aTag || !status) throw new Error("rsvp missing tags");
  if (!(RSVP_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`invalid rsvp status: ${status}`);
  }
  const organizerPubkey = parseNostrCoordinate(aTag, KIND_EVENT_LISTING)?.pubkey;
  const clientTag = evt.tags.find((t) => t[0] === "client")?.[1] ?? null;
  return {
    nostrId: evt.id,
    pubkey: evt.pubkey,
    eventCoordinate: aTag,
    organizerPubkey,
    status: status as RsvpStatusString,
    note: evt.content ?? "",
    clientTag,
  };
}

export function rsvpStatusToDb(s: RsvpStatusString): "GOING" | "MAYBE" | "NOT_GOING" | "WAITLIST" {
  switch (s) {
    case "accepted":  return "GOING";
    case "tentative": return "MAYBE";
    case "declined":  return "NOT_GOING";
    case "waitlist":  return "WAITLIST";
  }
}

export function dbToRsvpStatus(s: "GOING" | "MAYBE" | "NOT_GOING" | "WAITLIST"): RsvpStatusString {
  switch (s) {
    case "GOING":     return "accepted";
    case "MAYBE":     return "tentative";
    case "NOT_GOING": return "declined";
    case "WAITLIST":  return "waitlist";
  }
}

export function eventModeToDb(m: EventModeString): "ONLINE" | "OFFLINE" | "HYBRID" {
  return m.toUpperCase() as "ONLINE" | "OFFLINE" | "HYBRID";
}

export function eventModeToWire(m: "ONLINE" | "OFFLINE" | "HYBRID"): EventModeString {
  return m.toLowerCase() as EventModeString;
}
