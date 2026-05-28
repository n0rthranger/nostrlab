import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authEventForRequest, verifyAuthEnvelope } from "@/lib/auth";
import { communityUpdateSchema } from "@/lib/validation";
import { ensureUser } from "@/lib/nostr/profile";
import { safeUrl } from "@/lib/utils";
import { communityToDTO } from "@/lib/dto";
import { communityVerificationFor } from "@/lib/community-verification";
import { validateCommunityDefinition } from "@/lib/nostr/community-definition";
import { validateCalendarList } from "@/lib/nostr/calendar-list";
import { publishToRelays } from "@/lib/nostr/relay-pool";

export const dynamic = "force-dynamic";

function publicUrl(req: Request, value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return value;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? req.headers.get("origin") ?? "http://localhost:3000";
  return new URL(value, base).toString();
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = communityUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const community = await prisma.community.findUnique({
    where: { id },
    include: { organizer: true },
  });
  if (!community) return NextResponse.json({ error: "community not found" }, { status: 404 });

  const payload = {
    communityId: id,
    name: parsed.data.name,
    description: parsed.data.description,
    imageUrl: parsed.data.imageUrl ?? null,
    website: parsed.data.website ?? null,
    tags: parsed.data.tags,
    moderators: parsed.data.moderators,
    transferPubkey: parsed.data.transferPubkey ?? null,
  };
  const authEvent = authEventForRequest(req, parsed.data.signedAuthEvent);
  if (!authEvent) return NextResponse.json({ error: "missing auth event" }, { status: 401 });
  const auth = verifyAuthEnvelope(authEvent, {
    expectedAction: "community.update",
    expectedTags: { community_id: id },
    expectedPayload: payload,
    request: req,
  });
  if (!auth.ok || !auth.pubkey) {
    return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: 401 });
  }
  if (community.organizerPubkey !== auth.pubkey) {
    return NextResponse.json({ error: "only the community owner can update settings" }, { status: 403 });
  }

  const nextOrganizerPubkey = parsed.data.transferPubkey ?? community.organizerPubkey;
  const organizer = nextOrganizerPubkey === community.organizerPubkey
    ? community.organizer
    : await ensureUser(nextOrganizerPubkey);
  const moderators = Array.from(new Set(
    parsed.data.moderators
      .map((p) => p.toLowerCase())
      .filter((p) => p !== nextOrganizerPubkey)
  ));
  for (const moderator of moderators) {
    await ensureUser(moderator).catch(() => {});
  }
  const tags = Array.from(new Set(parsed.data.tags.map((t) => t.toLowerCase())));
  const imageUrl = parsed.data.imageUrl?.startsWith("/uploads/")
    ? parsed.data.imageUrl
    : safeUrl(parsed.data.imageUrl);
  const website = safeUrl(parsed.data.website);
  const verification = communityVerificationFor(website, organizer);
  const signedCommunityEvent = parsed.data.signedCommunityEvent;
  const signedCalendarEvent = parsed.data.signedCalendarEvent;
  if (signedCommunityEvent) {
    const reason = validateCommunityDefinition(signedCommunityEvent, {
      pubkey: nextOrganizerPubkey,
      slug: community.slug,
      name: parsed.data.name,
      description: parsed.data.description,
      imageUrls: [imageUrl, publicUrl(req, imageUrl)].filter((url): url is string => !!url),
      website,
      tags,
      moderatorPubkeys: moderators,
    });
    if (reason) return NextResponse.json({ error: reason }, { status: 400 });
  }
  if (signedCalendarEvent) {
    const reason = validateCalendarList(signedCalendarEvent, {
      pubkey: nextOrganizerPubkey,
      dTag: community.slug,
      title: parsed.data.name,
      description: parsed.data.description,
    });
    if (reason) return NextResponse.json({ error: reason }, { status: 400 });
  }
  const communityEventPatch = signedCommunityEvent
    ? {
        nostrId: signedCommunityEvent.id,
        rawEvent: signedCommunityEvent as unknown as Prisma.InputJsonValue,
      }
    : nextOrganizerPubkey !== community.organizerPubkey
    ? {
        nostrId: null,
        rawEvent: Prisma.DbNull,
      }
    : {};
  const calendarEventPatch = signedCalendarEvent
    ? {
        calendarNostrId: signedCalendarEvent.id,
        rawCalendarEvent: signedCalendarEvent as unknown as Prisma.InputJsonValue,
      }
    : nextOrganizerPubkey !== community.organizerPubkey
    ? {
        calendarNostrId: null,
        rawCalendarEvent: Prisma.DbNull,
      }
    : {};

  let updated;
  try {
    updated = await prisma.community.update({
      where: { id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        imageUrl,
        website,
        verifiedAt: verification.verifiedAt,
        verifiedMethod: verification.verifiedMethod,
        ...communityEventPatch,
        ...calendarEventPatch,
        organizerPubkey: nextOrganizerPubkey,
        tags: {
          deleteMany: {},
          create: tags.map((tag) => ({ tag })),
        },
        moderators: {
          deleteMany: {},
          create: moderators.map((pubkey) => ({ pubkey })),
        },
      },
      include: {
        organizer: true,
        tags: true,
        _count: { select: { events: true, followers: true } },
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "community update conflicts with existing data" }, { status: 409 });
    }
    throw e;
  }

  const upcomingCount = await prisma.event.count({
    where: { communityId: id, startsAt: { gte: new Date() }, duplicateOfId: null },
  });
  if (signedCommunityEvent) publishToRelays(signedCommunityEvent).catch(() => {});
  if (signedCalendarEvent) publishToRelays(signedCalendarEvent).catch(() => {});
  return NextResponse.json({ community: communityToDTO(updated, upcomingCount) });
}
