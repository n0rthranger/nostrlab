import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeUrl, sanitizeDescription } from "@/lib/utils";
import { isBanned } from "@/lib/moderation";
import type { NostrEvent } from "./types";
import { verifyNostrEvent } from "./verify";
import { parseEventListing, eventModeToDb } from "./parse";
import { KIND_COMMUNITY } from "./kinds";
import { ensureUser } from "./profile";
import { evaluateEventRelevance, isNostrLabAuthoredEvent, type EventRelevance } from "./event-relevance";
import { parseNostrCoordinate } from "./coordinates";
import { eventDedupeKey, findDuplicateEvent, type DuplicateEventMatch } from "@/lib/events/dedupe";

type EventIngestStatus = "stored" | "skipped" | "older" | "duplicate";

export interface EventIngestResult {
  status: EventIngestStatus;
  id?: string;
  nostrId?: string;
  reason?: string;
  duplicate?: DuplicateEventMatch;
  relevance?: EventRelevance;
  source: "nostrlab" | "external" | "unknown";
}

export interface EventIngestOptions {
  trustNostrLabSource?: boolean;
  allowNostrLabHashtag?: boolean;
}

function invalid(reason: string, source: EventIngestResult["source"] = "unknown"): EventIngestResult {
  return { status: "skipped", reason, source };
}

export async function ingestEventListing(
  evt: NostrEvent,
  options: EventIngestOptions = {}
): Promise<EventIngestResult> {
  if (!verifyNostrEvent(evt)) throw new Error("invalid signature");
  if (await isBanned(evt.pubkey)) return invalid("banned");

  let parsed;
  try {
    parsed = parseEventListing(evt);
  } catch (e) {
    return invalid((e as Error).message);
  }

  const source = isNostrLabAuthoredEvent(evt, parsed, options) ? "nostrlab" : "external";
  const relevance = evaluateEventRelevance(parsed, evt, new Date(), options);
  if (!relevance.ok) {
    return { ...invalid(relevance.reason, source), relevance };
  }

  if (parsed.title.length > 140) return invalid("title too long", source);
  if (parsed.description.length > 20_000) return invalid("description too long", source);
  if (parsed.endsAt && parsed.endsAt <= parsed.startsAt) return invalid("end must be after start", source);
  if (parsed.capacity !== undefined && (parsed.capacity < 1 || parsed.capacity > 1_000_000)) {
    return invalid("invalid capacity", source);
  }
  if (parsed.priceSats !== undefined && (parsed.priceSats < 0 || parsed.priceSats > 100_000_000)) {
    return invalid("invalid price", source);
  }

  const cohostPubkeys = Array.from(new Set(parsed.cohostPubkeys.map((p) => p.toLowerCase())))
    .filter((p) => p !== parsed.organizerPubkey.toLowerCase() && /^[0-9a-f]{64}$/i.test(p));
  const hashtags = Array.from(new Set(
    parsed.hashtags
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0 && t.length <= 40)
  )).slice(0, 20);

  const deleted = await prisma.deletedEvent.findUnique({
    where: {
      organizerPubkey_dTag: {
        organizerPubkey: parsed.organizerPubkey,
        dTag: parsed.dTag,
      },
    },
    select: { deletionCreatedAt: true },
  });
  if (deleted && deleted.deletionCreatedAt >= evt.created_at) {
    return { ...invalid("deleted by organizer", source), relevance };
  }

  const existing = await prisma.event.findUnique({
    where: {
      organizerPubkey_dTag: {
        organizerPubkey: parsed.organizerPubkey,
        dTag: parsed.dTag,
      },
    },
    select: { id: true, nostrId: true, rawEvent: true },
  });
  if (existing) {
    const existingTs = (existing.rawEvent as { created_at?: number } | null)?.created_at ?? 0;
    if (evt.created_at <= existingTs) {
      return {
        status: "older",
        id: existing.id,
        nostrId: existing.nostrId,
        reason: "older",
        relevance,
        source,
      };
    }
  }

  const dedupeInput = {
    title: parsed.title,
    startsAt: parsed.startsAt,
    mode: eventModeToDb(parsed.mode),
    city: parsed.city,
    venue: parsed.venue,
    geohash: parsed.geohash,
    organizerPubkey: parsed.organizerPubkey,
    dTag: parsed.dTag,
    excludeEventId: existing?.id,
  };
  const duplicate = await findDuplicateEvent(dedupeInput);
  if (duplicate) {
    return {
      status: "duplicate",
      id: duplicate.id,
      nostrId: duplicate.nostrId,
      reason: "duplicate event",
      duplicate,
      relevance,
      source,
    };
  }

  await ensureUser(parsed.organizerPubkey);
  const ensuredCohosts: string[] = [];
  for (const co of cohostPubkeys) {
    try {
      await ensureUser(co);
      ensuredCohosts.push(co);
    } catch {
      // External events sometimes reference pubkeys whose profiles are not
      // reachable. The event remains indexable without that co-host relation.
    }
  }

  const sanitizedDesc = sanitizeDescription(parsed.description);
  const bannerUrl = safeUrl(parsed.bannerUrl);
  const isPaid = !!(parsed.priceSats && parsed.priceSats > 0);
  const dedupeKey = eventDedupeKey(dedupeInput);
  const recurrenceFrequency =
    parsed.recurrenceFrequency === "weekly" ? "WEEKLY"
    : parsed.recurrenceFrequency === "monthly" ? "MONTHLY"
    : parsed.recurrenceGroupId ? "NONE"
    : undefined;

  let communityId: string | null = null;
  if (parsed.communityCoordinate) {
    const communityRef = parseNostrCoordinate(parsed.communityCoordinate, KIND_COMMUNITY);
    if (communityRef) {
      const community = await prisma.community.findFirst({
        where: {
          slug: communityRef.dTag,
          organizerPubkey: communityRef.pubkey,
        },
        select: { id: true, organizerPubkey: true, moderators: { select: { pubkey: true } } },
      });
      if (community) {
        const organizer = parsed.organizerPubkey.toLowerCase();
        const allowed = community.organizerPubkey === organizer
          || community.moderators.some((moderator) => moderator.pubkey === organizer);
        if (!allowed) {
          if (source === "nostrlab") return invalid("community host approval required", source);
        } else {
          communityId = community.id;
        }
      }
    }
  }

  let upserted;
  try {
    upserted = await prisma.event.upsert({
      where: {
        organizerPubkey_dTag: {
          organizerPubkey: parsed.organizerPubkey,
          dTag: parsed.dTag,
        },
      },
      create: {
        nostrId: parsed.nostrId,
        dTag: parsed.dTag,
        organizerPubkey: parsed.organizerPubkey,
        title: parsed.title,
        summary: parsed.summary,
        description: sanitizedDesc,
        bannerUrl,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
        timezone: parsed.tzid,
        city: parsed.city,
        venue: parsed.venue,
        geohash: parsed.geohash,
        mode: eventModeToDb(parsed.mode),
        capacity: parsed.capacity,
        paymentMode: isPaid ? "PAID" : "FREE",
        priceSats: isPaid ? parsed.priceSats : null,
        recurrenceGroupId: parsed.recurrenceGroupId,
        recurrenceIndex: parsed.recurrenceIndex,
        recurrenceFrequency,
        communityId,
        clientTag: parsed.clientTag,
        dedupeKey,
        rawEvent: evt as unknown as Prisma.InputJsonValue,
        tags: { create: hashtags.map((tag) => ({ tag })) },
        cohosts: { create: ensuredCohosts.map((p) => ({ pubkey: p })) },
      },
      update: {
        nostrId: parsed.nostrId,
        title: parsed.title,
        summary: parsed.summary,
        description: sanitizedDesc,
        bannerUrl,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
        timezone: parsed.tzid,
        city: parsed.city,
        venue: parsed.venue,
        geohash: parsed.geohash,
        mode: eventModeToDb(parsed.mode),
        capacity: parsed.capacity,
        paymentMode: isPaid ? "PAID" : "FREE",
        priceSats: isPaid ? parsed.priceSats : null,
        recurrenceGroupId: parsed.recurrenceGroupId,
        recurrenceIndex: parsed.recurrenceIndex,
        recurrenceFrequency,
        communityId,
        clientTag: parsed.clientTag,
        dedupeKey,
        rawEvent: evt as unknown as Prisma.InputJsonValue,
        tags: {
          deleteMany: {},
          create: hashtags.map((tag) => ({ tag })),
        },
        cohosts: {
          deleteMany: {},
          create: ensuredCohosts.map((p) => ({ pubkey: p })),
        },
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const duplicateAfterRace = await findDuplicateEvent(dedupeInput);
      if (duplicateAfterRace) {
        return {
          status: "duplicate",
          id: duplicateAfterRace.id,
          nostrId: duplicateAfterRace.nostrId,
          reason: "duplicate event",
          duplicate: duplicateAfterRace,
          relevance,
          source,
        };
      }
    }
    throw e;
  }

  return {
    status: "stored",
    id: upserted.id,
    nostrId: upserted.nostrId,
    relevance,
    source,
  };
}
