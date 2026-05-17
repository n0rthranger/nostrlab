import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { eventActivityCounts, hasEventActivity } from "@/lib/events/delete-policy";
import { KIND_EVENT_DELETION, KIND_EVENT_LISTING } from "./kinds";
import { parseNostrCoordinate } from "./coordinates";
import type { NostrEvent } from "./types";
import { verifyNostrEvent } from "./verify";

interface DeletionTarget {
  organizerPubkey: string;
  dTag: string;
  eventNostrId?: string | null;
  eventId?: string | null;
}

export interface EventDeletionIngestResult {
  status: "stored" | "skipped";
  deleted: number;
  cancelled: number;
  targets: DeletionTarget[];
  reason?: string;
}

function uniqueTargetKey(target: Pick<DeletionTarget, "organizerPubkey" | "dTag">): string {
  return `${target.organizerPubkey}:${target.dTag}`;
}

function deletionReason(evt: NostrEvent): string | null {
  const trimmed = evt.content.trim();
  return trimmed ? trimmed.slice(0, 2000) : null;
}

async function deletionTargets(evt: NostrEvent, restrictToEventId?: string): Promise<DeletionTarget[]> {
  const byKey = new Map<string, DeletionTarget>();

  for (const tag of evt.tags) {
    if (tag[0] !== "a") continue;
    const coord = parseNostrCoordinate(tag[1], KIND_EVENT_LISTING);
    if (!coord || coord.pubkey !== evt.pubkey.toLowerCase()) continue;
    byKey.set(uniqueTargetKey({ organizerPubkey: coord.pubkey, dTag: coord.dTag }), {
      organizerPubkey: coord.pubkey,
      dTag: coord.dTag,
    });
  }

  const eventIds = evt.tags
    .filter((tag) => tag[0] === "e" && /^[0-9a-f]{64}$/i.test(tag[1] ?? ""))
    .map((tag) => tag[1].toLowerCase());
  if (eventIds.length > 0) {
    const rows = await prisma.event.findMany({
      where: {
        nostrId: { in: eventIds },
        organizerPubkey: evt.pubkey.toLowerCase(),
        ...(restrictToEventId ? { id: restrictToEventId } : {}),
      },
      select: { id: true, organizerPubkey: true, dTag: true, nostrId: true },
    });
    for (const row of rows) {
      const key = uniqueTargetKey(row);
      byKey.set(key, {
        organizerPubkey: row.organizerPubkey,
        dTag: row.dTag,
        eventNostrId: row.nostrId,
        eventId: row.id,
      });
    }
  }

  if (restrictToEventId) {
    const row = await prisma.event.findUnique({
      where: { id: restrictToEventId },
      select: { id: true, organizerPubkey: true, dTag: true, nostrId: true },
    });
    if (row) {
      const key = uniqueTargetKey(row);
      const existing = byKey.get(key);
      if (existing) {
        byKey.set(key, { ...existing, eventId: row.id, eventNostrId: row.nostrId });
      }
    }
  }

  return [...byKey.values()];
}

export async function ingestEventDeletion(
  evt: NostrEvent,
  opts: { restrictToEventId?: string; hardDeleteInactive?: boolean } = {}
): Promise<EventDeletionIngestResult> {
  if (evt.kind !== KIND_EVENT_DELETION) return { status: "skipped", deleted: 0, cancelled: 0, targets: [], reason: "wrong kind" };
  if (!verifyNostrEvent(evt)) throw new Error("invalid signature");

  const targets = await deletionTargets(evt, opts.restrictToEventId);
  if (targets.length === 0) {
    return { status: "skipped", deleted: 0, cancelled: 0, targets: [], reason: "no matching event coordinates" };
  }

  let deleted = 0;
  let cancelled = 0;
  const reason = deletionReason(evt);
  const deletionDate = new Date(evt.created_at * 1000);

  await prisma.$transaction(async (tx) => {
    for (const target of targets) {
      const existingDeletion = await tx.deletedEvent.findUnique({
        where: {
          organizerPubkey_dTag: {
            organizerPubkey: target.organizerPubkey,
            dTag: target.dTag,
          },
        },
        select: { deletionCreatedAt: true },
      });
      if (existingDeletion && existingDeletion.deletionCreatedAt > evt.created_at) continue;

      const event = target.eventId
        ? await tx.event.findUnique({
            where: { id: target.eventId },
            select: { id: true, nostrId: true },
          })
        : await tx.event.findUnique({
            where: {
              organizerPubkey_dTag: {
                organizerPubkey: target.organizerPubkey,
                dTag: target.dTag,
              },
            },
            select: { id: true, nostrId: true },
          });

      await tx.deletedEvent.upsert({
        where: {
          organizerPubkey_dTag: {
            organizerPubkey: target.organizerPubkey,
            dTag: target.dTag,
          },
        },
        create: {
          organizerPubkey: target.organizerPubkey,
          dTag: target.dTag,
          eventNostrId: event?.nostrId ?? target.eventNostrId ?? null,
          deletionNostrId: evt.id,
          deletionCreatedAt: evt.created_at,
          reason,
          rawEvent: evt as unknown as Prisma.InputJsonValue,
        },
        update: {
          eventNostrId: event?.nostrId ?? target.eventNostrId ?? null,
          deletionNostrId: evt.id,
          deletionCreatedAt: evt.created_at,
          reason,
          rawEvent: evt as unknown as Prisma.InputJsonValue,
        },
      });

      if (!event) continue;
      const counts = await eventActivityCounts(event.id, tx);
      if (opts.hardDeleteInactive && !hasEventActivity(counts)) {
        await tx.event.delete({ where: { id: event.id } });
        deleted += 1;
      } else {
        await tx.event.update({
          where: { id: event.id },
          data: {
            status: "CANCELLED",
            cancelledAt: deletionDate,
            cancellationReason: reason ?? "Deleted by organizer on Nostr.",
          },
        });
        cancelled += 1;
      }
    }
  });

  return { status: "stored", deleted, cancelled, targets };
}
