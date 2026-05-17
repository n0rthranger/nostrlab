import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { eventToDetailDTO } from "@/lib/dto";
import { nostrEventSchema } from "@/lib/validation";
import { isBanned } from "@/lib/moderation";
import { verifyAuthEnvelope } from "@/lib/auth";
import { notifyEventRecipients } from "@/lib/notifications";
import { verifyNostrEvent } from "@/lib/nostr/verify";
import { KIND_EVENT_DELETION, KIND_EVENT_LISTING } from "@/lib/nostr/kinds";
import { eventCoordinate } from "@/lib/nostr/event-builder";
import { ingestEventDeletion } from "@/lib/nostr/ingest-deletion";
import { publishToRelays } from "@/lib/nostr/relay-pool";
import { eventActivityCounts, eventDeleteBlockedReason, hasEventActivity } from "@/lib/events/delete-policy";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      organizer: true,
      tags: true,
      cohosts: { include: { user: true } },
      ticketTiers: { include: { _count: { select: { tickets: true } } }, orderBy: { priceSats: "asc" } },
      rsvps: { include: { user: true }, orderBy: { updatedAt: "desc" } },
      _count: { select: { rsvps: true } },
    },
  });
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (await isBanned(event.organizerPubkey)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [eventsCreated, organizer] = await Promise.all([
    prisma.event.count({ where: { organizerPubkey: event.organizerPubkey } }),
    prisma.user.findUnique({ where: { pubkey: event.organizerPubkey } }),
  ]);
  const pastAttendees = await prisma.rsvp.count({
    where: {
      status: "GOING",
      event: {
        organizerPubkey: event.organizerPubkey,
        startsAt: { lt: new Date() },
      },
    },
  });

  const profileAgeDays = organizer?.createdAt
    ? Math.floor((Date.now() - organizer.createdAt.getTime()) / 86_400_000)
    : null;

  return NextResponse.json({
    event: eventToDetailDTO(event, {
      eventsCreated,
      pastAttendees,
      profileAgeDays,
    }),
  });
}

const statusSchema = z.object({
  action: z.enum(["cancel", "restore"]),
  reason: z.string().max(2000).nullable().optional(),
  signedAuthEvent: z.object({
    id: z.string(),
    pubkey: z.string(),
    kind: z.number(),
    created_at: z.number(),
    tags: z.array(z.array(z.string())),
    content: z.string(),
    sig: z.string(),
  }),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const event = await prisma.event.findUnique({
    where: { id },
    include: { cohosts: true },
  });
  if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });

  const payload = {
    eventId: id,
    reason: parsed.data.reason?.trim() || null,
  };
  const auth = verifyAuthEnvelope(parsed.data.signedAuthEvent, {
    expectedAction: parsed.data.action === "cancel" ? "event.cancel" : "event.restore",
    expectedTags: { e: id },
    expectedPayload: payload,
  });
  if (!auth.ok || !auth.pubkey) return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: 401 });
  const allowed = event.organizerPubkey === auth.pubkey || event.cohosts.some((c) => c.pubkey === auth.pubkey);
  if (!allowed) return NextResponse.json({ error: "not an organizer" }, { status: 403 });

  const next = parsed.data.action === "cancel"
    ? await prisma.event.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancellationReason: payload.reason,
        },
      })
    : await prisma.event.update({
        where: { id },
        data: {
          status: "ACTIVE",
          cancelledAt: null,
          cancellationReason: null,
        },
      });

  if (parsed.data.action === "cancel") {
    await notifyEventRecipients({
      eventId: id,
      type: "CANCELLATION",
      title: `Cancelled: ${event.title}`,
      body: payload.reason ?? "The organizer cancelled this event.",
      skipPubkey: auth.pubkey,
    });
  }

  return NextResponse.json({ ok: true, status: next.status });
}

const deleteSchema = z.object({
  signedDeletionEvent: nostrEventSchema,
});

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      nostrId: true,
      organizerPubkey: true,
      dTag: true,
    },
  });
  if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });

  const counts = await eventActivityCounts(event.id);
  if (hasEventActivity(counts)) {
    return NextResponse.json({
      error: "event has activity",
      message: eventDeleteBlockedReason(counts),
      counts,
    }, { status: 409 });
  }

  const deletion = parsed.data.signedDeletionEvent;
  if (deletion.kind !== KIND_EVENT_DELETION) {
    return NextResponse.json({ error: "deletion event must be kind 5" }, { status: 400 });
  }
  if (!verifyNostrEvent(deletion)) {
    return NextResponse.json({ error: "invalid deletion signature" }, { status: 400 });
  }
  if (deletion.pubkey.toLowerCase() !== event.organizerPubkey.toLowerCase()) {
    return NextResponse.json({ error: "deletion must be signed by the event organizer" }, { status: 403 });
  }

  const coord = eventCoordinate(event.organizerPubkey.toLowerCase(), event.dTag);
  const hasEventTag = deletion.tags.some((tag) => tag[0] === "e" && tag[1]?.toLowerCase() === event.nostrId.toLowerCase());
  const hasAddressTag = deletion.tags.some((tag) => tag[0] === "a" && tag[1] === coord);
  const hasKindTag = deletion.tags.some((tag) => tag[0] === "k" && tag[1] === String(KIND_EVENT_LISTING));
  if (!hasEventTag || !hasAddressTag || !hasKindTag) {
    return NextResponse.json({
      error: "deletion event must reference this event id and Nostr address",
    }, { status: 400 });
  }

  const result = await ingestEventDeletion(deletion, {
    restrictToEventId: event.id,
    hardDeleteInactive: true,
  });
  if (result.status !== "stored" || result.deleted < 1) {
    return NextResponse.json({
      error: "event deletion was not stored",
      reason: result.reason,
    }, { status: 400 });
  }

  const relays = await publishToRelays(deletion).catch(() => ({ ok: 0, failed: 0 }));
  return NextResponse.json({
    ok: true,
    deleted: true,
    deletionNostrId: deletion.id,
    relays,
  });
}
