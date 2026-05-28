import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isBanned } from "@/lib/moderation";
import { notifyEventRecipients } from "@/lib/notifications";
import type { NostrEvent } from "./types";
import { verifyNostrEvent } from "./verify";
import { parseCommunityList, parseEventComment } from "./social";
import { parseNostrCoordinate } from "./coordinates";
import { KIND_COMMUNITY, KIND_EVENT_LISTING } from "./kinds";
import { ensureUser } from "./profile";

export type SocialIngestStatus = "stored" | "skipped" | "older" | "duplicate";

export interface EventCommentIngestResult {
  status: SocialIngestStatus;
  type?: "comment" | "announcement";
  id?: string;
  eventId?: string;
  reason?: string;
}

export interface EventCommentIngestOptions {
  expectedEventId?: string;
  expectedAnnouncement?: boolean;
  notifyAnnouncements?: boolean;
}

export interface CommunityListIngestResult {
  status: SocialIngestStatus;
  followedCommunityIds: string[];
  reason?: string;
}

export interface CommunityListIngestOptions {
  expectedCommunityId?: string;
  expectedIncluded?: boolean;
}

function skipped(reason: string): EventCommentIngestResult {
  return { status: "skipped", reason };
}

function communitySkipped(reason: string, followedCommunityIds: string[] = []): CommunityListIngestResult {
  return { status: "skipped", reason, followedCommunityIds };
}

function createdAtDate(evt: NostrEvent): Date {
  const ms = evt.created_at * 1000;
  if (!Number.isFinite(ms) || ms < 0 || ms > 8_640_000_000_000_000) return new Date();
  return new Date(ms);
}

function announcementTitle(title: string | undefined, body: string): string {
  const fallback = body.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "Update";
  return (title ?? fallback).slice(0, 120);
}

export async function ingestEventComment(
  evt: NostrEvent,
  options: EventCommentIngestOptions = {}
): Promise<EventCommentIngestResult> {
  if (!verifyNostrEvent(evt)) throw new Error("invalid signature");
  if (await isBanned(evt.pubkey.toLowerCase())) return skipped("banned");

  let parsed;
  try {
    parsed = parseEventComment(evt);
  } catch (e) {
    return skipped((e as Error).message);
  }

  if (options.expectedAnnouncement !== undefined && parsed.isAnnouncement !== options.expectedAnnouncement) {
    return skipped(parsed.isAnnouncement ? "expected a public comment" : "expected an announcement");
  }

  const eventRef = parseNostrCoordinate(parsed.eventCoordinate, KIND_EVENT_LISTING);
  if (!eventRef) return skipped("bad event coordinate");

  const event = await prisma.event.findUnique({
    where: { organizerPubkey_dTag: { organizerPubkey: eventRef.pubkey, dTag: eventRef.dTag } },
    select: {
      id: true,
      title: true,
      organizerPubkey: true,
      cohosts: { select: { pubkey: true } },
    },
  });
  if (!event) return skipped("event not indexed");
  if (options.expectedEventId && event.id !== options.expectedEventId) {
    return skipped("comment refers to a different event");
  }

  await ensureUser(parsed.pubkey).catch(() => {});

  if (parsed.isAnnouncement) {
    const allowed = event.organizerPubkey === parsed.pubkey || event.cohosts.some((cohost) => cohost.pubkey === parsed.pubkey);
    if (!allowed) return skipped("not an organizer");

    const existing = await prisma.eventAnnouncement.findUnique({
      where: { nostrId: parsed.nostrId },
      select: { id: true, eventId: true },
    });
    if (existing) {
      return { status: "duplicate", type: "announcement", id: existing.id, eventId: existing.eventId };
    }

    const announcement = await prisma.eventAnnouncement.create({
      data: {
        eventId: event.id,
        pubkey: parsed.pubkey,
        title: announcementTitle(parsed.title, parsed.body),
        body: parsed.body,
        nostrId: parsed.nostrId,
        rawEvent: evt as unknown as Prisma.InputJsonValue,
        createdAt: createdAtDate(evt),
      },
    });

    if (options.notifyAnnouncements) {
      notifyEventRecipients({
        eventId: event.id,
        type: "ANNOUNCEMENT",
        title: `${event.title}: ${announcement.title}`,
        body: announcement.body,
        skipPubkey: parsed.pubkey,
        announcementId: announcement.id,
      }).catch(() => {});
    }

    return { status: "stored", type: "announcement", id: announcement.id, eventId: event.id };
  }

  const existing = await prisma.eventComment.findUnique({
    where: { nostrId: parsed.nostrId },
    select: { id: true, eventId: true },
  });
  if (existing) {
    return { status: "duplicate", type: "comment", id: existing.id, eventId: existing.eventId };
  }

  const comment = await prisma.eventComment.create({
    data: {
      eventId: event.id,
      pubkey: parsed.pubkey,
      body: parsed.body,
      nostrId: parsed.nostrId,
      rawEvent: evt as unknown as Prisma.InputJsonValue,
      createdAt: createdAtDate(evt),
    },
  });

  return { status: "stored", type: "comment", id: comment.id, eventId: event.id };
}

export async function ingestCommunityList(
  evt: NostrEvent,
  options: CommunityListIngestOptions = {}
): Promise<CommunityListIngestResult> {
  if (!verifyNostrEvent(evt)) throw new Error("invalid signature");
  if (await isBanned(evt.pubkey.toLowerCase())) return communitySkipped("banned");

  let parsed;
  try {
    parsed = parseCommunityList(evt);
  } catch (e) {
    return communitySkipped((e as Error).message);
  }

  const existingList = await prisma.communityFollowList.findUnique({
    where: { pubkey: parsed.pubkey },
    select: { eventCreatedAt: true },
  });
  if (existingList && evt.created_at <= existingList.eventCreatedAt) {
    const current = await prisma.communityFollow.findMany({
      where: { pubkey: parsed.pubkey },
      select: { communityId: true },
    });
    return { status: "older", followedCommunityIds: current.map((row) => row.communityId) };
  }

  const communities = await prisma.community.findMany({
    select: { id: true, organizerPubkey: true, slug: true },
  });
  const coordinateToId = new Map(
    communities.map((community) => [
      `${KIND_COMMUNITY}:${community.organizerPubkey}:${community.slug}`,
      community.id,
    ])
  );
  const followedCommunityIds = parsed.communityCoordinates
    .map((coord) => coordinateToId.get(coord))
    .filter((id): id is string => !!id);

  if (followedCommunityIds.length === 0 && !existingList && !options.expectedCommunityId) {
    const existingFollowCount = await prisma.communityFollow.count({ where: { pubkey: parsed.pubkey } });
    if (existingFollowCount === 0) return communitySkipped("no indexed communities in list");
  }

  if (options.expectedCommunityId) {
    const included = followedCommunityIds.includes(options.expectedCommunityId);
    if (included !== options.expectedIncluded) {
      return communitySkipped(
        options.expectedIncluded ? "community list is missing the followed community" : "community list still includes the community",
        followedCommunityIds
      );
    }
  }

  await ensureUser(parsed.pubkey).catch(() => {});

  const rawEvent = evt as unknown as Prisma.InputJsonValue;
  await prisma.$transaction(async (tx) => {
    await tx.communityFollow.deleteMany({
      where: {
        pubkey: parsed.pubkey,
        ...(followedCommunityIds.length > 0 ? { communityId: { notIn: followedCommunityIds } } : {}),
      },
    });

    for (const communityId of followedCommunityIds) {
      await tx.communityFollow.upsert({
        where: { communityId_pubkey: { communityId, pubkey: parsed.pubkey } },
        create: {
          communityId,
          pubkey: parsed.pubkey,
          nostrId: parsed.nostrId,
          rawEvent,
        },
        update: {
          nostrId: parsed.nostrId,
          rawEvent,
        },
      });
    }

    await tx.communityFollowList.upsert({
      where: { pubkey: parsed.pubkey },
      create: {
        pubkey: parsed.pubkey,
        nostrId: parsed.nostrId,
        eventCreatedAt: evt.created_at,
        rawEvent,
      },
      update: {
        nostrId: parsed.nostrId,
        eventCreatedAt: evt.created_at,
        rawEvent,
      },
    });
  });

  return { status: "stored", followedCommunityIds };
}
