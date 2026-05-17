// Ingest pipeline for RSVPs that arrive via the relay listener (i.e. signed
// in some other Nostr client and never POSTed to our API directly).
//
// Verifies signature → parses NIP-52 RSVP → upserts into the index. Skips
// RSVPs that don't reference one of OUR events. Banned pubkeys are ignored.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { NostrEvent } from "./types";
import { verifyNostrEvent } from "./verify";
import { parseRsvp, rsvpStatusToDb } from "./parse";
import { ensureUser } from "./profile";
import { isBanned } from "@/lib/moderation";
import { KIND_EVENT_LISTING } from "./kinds";
import { parseNostrCoordinate } from "./coordinates";

export async function ingestRsvp(evt: NostrEvent): Promise<"stored" | "skipped" | "older"> {
  if (!verifyNostrEvent(evt)) throw new Error("invalid signature");
  if (await isBanned(evt.pubkey)) return "skipped";

  const parsed = parseRsvp(evt);

  const eventRef = parseNostrCoordinate(parsed.eventCoordinate, KIND_EVENT_LISTING);
  if (!eventRef) return "skipped";

  const event = await prisma.event.findUnique({
    where: { organizerPubkey_dTag: { organizerPubkey: eventRef.pubkey, dTag: eventRef.dTag } },
    select: { id: true },
  });
  if (!event) return "skipped"; // Not one of our events.

  await ensureUser(parsed.pubkey).catch(() => {});

  const existing = await prisma.rsvp.findUnique({
    where: { eventId_pubkey: { eventId: event.id, pubkey: parsed.pubkey } },
  });
  if (existing) {
    const existingTs = (existing.rawEvent as { created_at?: number } | null)?.created_at ?? 0;
    if (evt.created_at <= existingTs) return "older";
  }

  await prisma.rsvp.upsert({
    where: { eventId_pubkey: { eventId: event.id, pubkey: parsed.pubkey } },
    create: {
      eventId: event.id,
      pubkey: parsed.pubkey,
      status: rsvpStatusToDb(parsed.status),
      nostrId: parsed.nostrId,
      rawEvent: evt as unknown as Prisma.InputJsonValue,
    },
    update: {
      status: rsvpStatusToDb(parsed.status),
      nostrId: parsed.nostrId,
      rawEvent: evt as unknown as Prisma.InputJsonValue,
    },
  });

  return "stored";
}
