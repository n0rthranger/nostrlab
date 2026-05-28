import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { communityCreateSchema } from "@/lib/validation";
import { authEventForRequest, verifyAuthEnvelope } from "@/lib/auth";
import { ensureUser } from "@/lib/nostr/profile";
import { communityToDTO } from "@/lib/dto";
import { isBanned } from "@/lib/moderation";
import { safeUrl } from "@/lib/utils";
import { normalizePubkey } from "@/lib/nostr/encode";
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

export async function GET(req: NextRequest) {
  const tag = req.nextUrl.searchParams.get("tag");
  const organizerRaw = req.nextUrl.searchParams.get("organizer");
  const hostRaw = req.nextUrl.searchParams.get("host");
  const followerRaw = req.nextUrl.searchParams.get("follower");
  let organizerPubkey: string | null = null;
  let hostPubkey: string | null = null;
  let followerPubkey: string | null = null;
  if (organizerRaw) {
    try { organizerPubkey = normalizePubkey(organizerRaw); }
    catch { return NextResponse.json({ error: "bad organizer pubkey" }, { status: 400 }); }
  }
  if (hostRaw) {
    try { hostPubkey = normalizePubkey(hostRaw); }
    catch { return NextResponse.json({ error: "bad host pubkey" }, { status: 400 }); }
  }
  if (followerRaw) {
    try { followerPubkey = normalizePubkey(followerRaw); }
    catch { return NextResponse.json({ error: "bad follower pubkey" }, { status: 400 }); }
  }
  const where: Prisma.CommunityWhereInput = {
    ...(tag ? { tags: { some: { tag: tag.toLowerCase() } } } : {}),
    ...(organizerPubkey ? { organizerPubkey } : {}),
    ...(followerPubkey ? { followers: { some: { pubkey: followerPubkey } } } : {}),
    ...(hostPubkey ? {
      OR: [
        { organizerPubkey: hostPubkey },
        { moderators: { some: { pubkey: hostPubkey } } },
      ],
    } : {}),
  };
  const communities = await prisma.community.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: { createdAt: "desc" },
    include: { organizer: true, tags: true, _count: { select: { events: true, followers: true } } },
    take: 60,
  });

  const upcomingCounts = await prisma.event.groupBy({
    by: ["communityId"],
    where: { communityId: { in: communities.map((c) => c.id) }, startsAt: { gte: new Date() }, duplicateOfId: null },
    _count: { _all: true },
  });
  const map = new Map(upcomingCounts.map((u) => [u.communityId!, u._count._all]));

  return NextResponse.json({
    communities: communities.map((c) => communityToDTO(c, map.get(c.id) ?? 0)),
  });
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = communityCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const authEvent = authEventForRequest(req, parsed.data.signedAuthEvent);
  if (!authEvent) return NextResponse.json({ error: "missing auth event" }, { status: 401 });
  const auth = verifyAuthEnvelope(authEvent, {
    expectedAction: "community.create",
    expectedTags: { slug: parsed.data.slug },
    expectedPayload: {
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description,
      imageUrl: parsed.data.imageUrl ?? null,
      website: parsed.data.website ?? null,
      tags: parsed.data.tags,
      moderators: parsed.data.moderators,
    },
    request: req,
  });
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: 401 });
  if (await isBanned(auth.pubkey!)) {
    return NextResponse.json({ error: "banned" }, { status: 403 });
  }

  const organizer = await ensureUser(auth.pubkey!);
  const moderators = Array.from(new Set(
    parsed.data.moderators.map((p) => p.toLowerCase()).filter((p) => p !== auth.pubkey)
  ));
  const tags = Array.from(new Set(parsed.data.tags.map((t) => t.toLowerCase())));
  for (const moderator of moderators) {
    await ensureUser(moderator).catch(() => {});
  }
  const imageUrl = parsed.data.imageUrl?.startsWith("/uploads/")
    ? parsed.data.imageUrl
    : safeUrl(parsed.data.imageUrl);
  const website = safeUrl(parsed.data.website);
  const verification = communityVerificationFor(website, organizer);
  const signedCommunityEvent = parsed.data.signedCommunityEvent;
  const signedCalendarEvent = parsed.data.signedCalendarEvent;
  if (signedCommunityEvent) {
    const reason = validateCommunityDefinition(signedCommunityEvent, {
      pubkey: auth.pubkey!,
      slug: parsed.data.slug,
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
      pubkey: auth.pubkey!,
      dTag: parsed.data.slug,
      title: parsed.data.name,
      description: parsed.data.description,
    });
    if (reason) return NextResponse.json({ error: reason }, { status: 400 });
  }

  let community;
  try {
    community = await prisma.community.create({
      data: {
        slug: parsed.data.slug,
        name: parsed.data.name,
        description: parsed.data.description,
        imageUrl,
        website,
        verifiedAt: verification.verifiedAt,
        verifiedMethod: verification.verifiedMethod,
        nostrId: signedCommunityEvent?.id,
        rawEvent: signedCommunityEvent as unknown as Prisma.InputJsonValue | undefined,
        calendarNostrId: signedCalendarEvent?.id,
        rawCalendarEvent: signedCalendarEvent as unknown as Prisma.InputJsonValue | undefined,
        organizerPubkey: auth.pubkey!,
        tags: { create: tags.map((tag) => ({ tag })) },
        moderators: {
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
      return NextResponse.json({ error: "community slug already exists" }, { status: 409 });
    }
    throw e;
  }
  if (signedCommunityEvent) publishToRelays(signedCommunityEvent).catch(() => {});
  if (signedCalendarEvent) publishToRelays(signedCalendarEvent).catch(() => {});
  return NextResponse.json({ community: communityToDTO(community, 0) });
}
