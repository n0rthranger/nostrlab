import type { NostrEvent } from "./types";
import type { ParsedEventListing } from "./parse";
import { APP_NAME } from "./kinds";

export interface EventRelevance {
  ok: boolean;
  score: number;
  reason: string;
  matched: string[];
}

export interface EventRelevanceOptions {
  trustNostrLabSource?: boolean;
  allowNostrLabHashtag?: boolean;
}

const DAY_MS = 86_400_000;
const MIN_TITLE_LENGTH = 4;
const PAST_GRACE_MS = 30 * DAY_MS;
const FUTURE_LIMIT_MS = 2 * 365 * DAY_MS;

const EVENT_TERMS = [
  "meetup",
  "meet-up",
  "workshop",
  "conference",
  "summit",
  "hackathon",
  "demo day",
  "webinar",
  "seminar",
  "lecture",
  "talk",
  "panel",
  "class",
  "training",
  "course",
  "bootcamp",
  "retreat",
  "unconference",
  "convention",
  "expo",
  "festival",
  "screening",
  "concert",
  "open mic",
  "jam session",
  "book club",
  "club night",
  "social",
  "mixer",
  "gathering",
  "hangout",
  "party",
  "bbq",
  "brunch",
  "dinner",
  "coffee chat",
  "community call",
  "town hall",
  "office hours",
  "coworking",
  "run club",
  "bike ride",
  "hike",
  "yoga",
  "tournament",
  "game night",
] as const;

const COMMUNITY_TAGS = new Set([
  "meetup",
  "event",
  "events",
  "community",
  "conference",
  "workshop",
  "hackathon",
  "summit",
  "webinar",
  "seminar",
  "talk",
  "panel",
  "class",
  "training",
  "social",
  "mixer",
  "party",
  "bbq",
  "brunch",
  "bitcoin",
  "btc",
  "satoshi",
  "nostr",
  "nip",
  "lightning",
  "ln",
  "open-source",
  "opensource",
  "founders",
  "startup",
  "developer",
  "dev",
  "builders",
  "art",
  "music",
  "film",
  "bookclub",
  "runclub",
]);

const PRIVATE_OR_PERSONAL_TERMS = [
  "dentist",
  "doctor",
  "therapy",
  "medical",
  "appointment",
  "reminder",
  "medication",
  "pay bill",
  "bill due",
  "flight",
  "hotel check",
  "vacation",
  "pto",
  "out of office",
  "standup",
  "1:1",
  "one-on-one",
  "performance review",
] as const;

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tagValues(evt: NostrEvent, tagName: string): string[] {
  return evt.tags
    .filter((t) => t[0] === tagName)
    .map((t) => t[1])
    .filter(Boolean);
}

export function isNostrLabAuthoredEvent(
  evt: NostrEvent,
  parsed?: Pick<ParsedEventListing, "clientTag">,
  options: EventRelevanceOptions = {}
): boolean {
  if (!options.trustNostrLabSource) return false;
  if (parsed?.clientTag?.toLowerCase() === APP_NAME) return true;
  if (!options.allowNostrLabHashtag) return false;
  return tagValues(evt, "t").some((tag) => tag.toLowerCase() === APP_NAME);
}

export function evaluateEventRelevance(
  parsed: ParsedEventListing,
  evt: NostrEvent,
  now = new Date(),
  options: EventRelevanceOptions = {}
): EventRelevance {
  if (isNostrLabAuthoredEvent(evt, parsed, options)) {
    return { ok: true, score: 100, reason: "nostrlab-authored", matched: ["nostrlab"] };
  }

  if (parsed.title.trim().length < MIN_TITLE_LENGTH) {
    return { ok: false, score: 0, reason: "title too short", matched: [] };
  }

  const startMs = parsed.startsAt.getTime();
  if (!Number.isFinite(startMs)) {
    return { ok: false, score: 0, reason: "invalid start time", matched: [] };
  }
  if (startMs < now.getTime() - PAST_GRACE_MS) {
    return { ok: false, score: 0, reason: "too far in the past", matched: [] };
  }
  if (startMs > now.getTime() + FUTURE_LIMIT_MS) {
    return { ok: false, score: 0, reason: "too far in the future", matched: [] };
  }
  if (parsed.endsAt && parsed.endsAt <= parsed.startsAt) {
    return { ok: false, score: 0, reason: "end before start", matched: [] };
  }

  const tags = tagValues(evt, "t").map((tag) => normalize(tag));
  const locations = tagValues(evt, "location");
  const references = tagValues(evt, "r");
  const haystack = normalize([
    parsed.title,
    parsed.summary ?? "",
    parsed.description,
    tags.join(" "),
    locations.join(" "),
    references.join(" "),
  ].join(" "));

  let score = 0;
  const matched: string[] = [];

  for (const term of EVENT_TERMS) {
    if (haystack.includes(term)) {
      score += 3;
      matched.push(`term:${term}`);
      break;
    }
  }

  const matchingTags = tags.filter((tag) => COMMUNITY_TAGS.has(tag));
  if (matchingTags.length > 0) {
    score += Math.min(4, 2 + matchingTags.length);
    matched.push(`tag:${matchingTags.slice(0, 3).join(",")}`);
  }

  const hasPlace = locations.length > 0 || !!parsed.city || !!parsed.venue || !!parsed.geohash;
  if (hasPlace) {
    score += 1;
    matched.push("place");
  }

  const hasUrl = [...locations, ...references, parsed.description].some((value) => /https?:\/\//i.test(value));
  if (hasUrl || parsed.mode === "online" || parsed.mode === "hybrid") {
    score += 1;
    matched.push("online-or-reference");
  }

  if (parsed.description.trim().length >= 80 || parsed.summary?.trim()) {
    score += 1;
    matched.push("description");
  }

  if (parsed.bannerUrl) {
    score += 1;
    matched.push("image");
  }

  if (parsed.communityCoordinate) {
    score += 2;
    matched.push("calendar-request");
  }

  if (parsed.cohostPubkeys.length > 0) {
    score += 1;
    matched.push("hosts");
  }

  const looksPrivate = PRIVATE_OR_PERSONAL_TERMS.some((term) => haystack.includes(term));
  if (looksPrivate && score < 5) {
    return { ok: false, score, reason: "looks private or personal", matched };
  }

  if (score < 3) {
    return { ok: false, score, reason: "not enough meetup/event signals", matched };
  }

  return { ok: true, score, reason: "event-like", matched };
}
