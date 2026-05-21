import type { EventMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DEDUPE_WINDOW_MS = 15 * 60 * 1000;
const GEOHASH_PREFIX_LENGTH = 7;

type ModeInput = EventMode | "online" | "offline" | "hybrid";

export interface EventDedupeInput {
  title: string;
  startsAt: Date | string;
  mode: ModeInput;
  city?: string | null;
  venue?: string | null;
  geohash?: string | null;
  organizerPubkey?: string | null;
  dTag?: string | null;
  excludeEventId?: string | null;
}

export interface DuplicateEventMatch {
  id: string;
  nostrId: string;
  title: string;
  startsAt: string;
  city: string | null;
  venue: string | null;
  mode: EventMode;
  organizerPubkey: string;
  dTag: string;
  dedupeKey: string | null;
  reason: "dedupe-key" | "semantic";
}

type CandidateEvent = {
  id: string;
  nostrId: string;
  dTag: string;
  organizerPubkey: string;
  title: string;
  startsAt: Date;
  city: string | null;
  venue: string | null;
  geohash: string | null;
  mode: EventMode;
  dedupeKey: string | null;
};

function toDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDbMode(mode: ModeInput): EventMode {
  return mode.toUpperCase() as EventMode;
}

function normalizeText(value?: string | null): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function geohashPrefix(value?: string | null): string {
  const geohash = (value ?? "").trim().toLowerCase();
  return geohash.length >= 5 ? geohash.slice(0, GEOHASH_PREFIX_LENGTH) : "";
}

function locationKey(input: Pick<EventDedupeInput, "mode" | "city" | "venue" | "geohash">): string | null {
  const mode = toDbMode(input.mode);
  if (mode === "ONLINE") return "online";

  const geohash = geohashPrefix(input.geohash);
  const city = normalizeText(input.city);
  const venue = normalizeText(input.venue);

  if (city && venue) return `place:${city}:${venue}`;
  if (geohash) return `geo:${geohash}`;
  if (city) return `city:${city}`;
  return null;
}

function sameOrganizerCoordinate(input: EventDedupeInput, candidate: CandidateEvent): boolean {
  return !!input.organizerPubkey
    && !!input.dTag
    && candidate.organizerPubkey.toLowerCase() === input.organizerPubkey.toLowerCase()
    && candidate.dTag === input.dTag;
}

function candidateToInput(candidate: CandidateEvent): EventDedupeInput {
  return {
    title: candidate.title,
    startsAt: candidate.startsAt,
    mode: candidate.mode,
    city: candidate.city,
    venue: candidate.venue,
    geohash: candidate.geohash,
    organizerPubkey: candidate.organizerPubkey,
    dTag: candidate.dTag,
    excludeEventId: candidate.id,
  };
}

function toMatch(candidate: CandidateEvent, reason: DuplicateEventMatch["reason"]): DuplicateEventMatch {
  return {
    id: candidate.id,
    nostrId: candidate.nostrId,
    title: candidate.title,
    startsAt: candidate.startsAt.toISOString(),
    city: candidate.city,
    venue: candidate.venue,
    mode: candidate.mode,
    organizerPubkey: candidate.organizerPubkey,
    dTag: candidate.dTag,
    dedupeKey: candidate.dedupeKey,
    reason,
  };
}

export function eventDedupeKey(input: EventDedupeInput): string | null {
  const startsAt = toDate(input.startsAt);
  const title = normalizeText(input.title);
  const location = locationKey(input);
  if (!startsAt || !title || !location) return null;

  const timeBucket = Math.floor(startsAt.getTime() / DEDUPE_WINDOW_MS);
  return [toDbMode(input.mode).toLowerCase(), timeBucket, title, location].join("|");
}

function isSemanticDuplicate(input: EventDedupeInput, candidate: CandidateEvent): boolean {
  const startsAt = toDate(input.startsAt);
  if (!startsAt) return false;
  if (Math.abs(candidate.startsAt.getTime() - startsAt.getTime()) > DEDUPE_WINDOW_MS) return false;
  if (normalizeText(input.title) !== normalizeText(candidate.title)) return false;

  const inputLocation = locationKey(input);
  const candidateLocation = locationKey(candidateToInput(candidate));
  return !!inputLocation && inputLocation === candidateLocation;
}

export async function findDuplicateEvent(input: EventDedupeInput): Promise<DuplicateEventMatch | null> {
  const startsAt = toDate(input.startsAt);
  if (!startsAt) return null;

  const dedupeKey = eventDedupeKey(input);
  const whereBase = {
    status: "ACTIVE" as const,
    duplicateOfId: null,
    ...(input.excludeEventId ? { id: { not: input.excludeEventId } } : {}),
  };

  if (dedupeKey) {
    const exact = await prisma.event.findFirst({
      where: {
        ...whereBase,
        dedupeKey,
      },
      select: {
        id: true,
        nostrId: true,
        dTag: true,
        organizerPubkey: true,
        title: true,
        startsAt: true,
        city: true,
        venue: true,
        geohash: true,
        mode: true,
        dedupeKey: true,
      },
    });
    if (exact && !sameOrganizerCoordinate(input, exact)) return toMatch(exact, "dedupe-key");
  }

  const candidates = await prisma.event.findMany({
    where: {
      ...whereBase,
      startsAt: {
        gte: new Date(startsAt.getTime() - DEDUPE_WINDOW_MS),
        lte: new Date(startsAt.getTime() + DEDUPE_WINDOW_MS),
      },
      mode: toDbMode(input.mode),
    },
    orderBy: { startsAt: "asc" },
    take: 100,
    select: {
      id: true,
      nostrId: true,
      dTag: true,
      organizerPubkey: true,
      title: true,
      startsAt: true,
      city: true,
      venue: true,
      geohash: true,
      mode: true,
      dedupeKey: true,
    },
  });

  const match = candidates.find((candidate) => (
    !sameOrganizerCoordinate(input, candidate) && isSemanticDuplicate(input, candidate)
  ));

  return match ? toMatch(match, "semantic") : null;
}
