import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { communityFollowSchema } from "@/lib/validation";
import { ingestCommunityList } from "@/lib/nostr/ingest-social";
import { publishToRelays } from "@/lib/nostr/relay-pool";

async function handle(req: Request, id: string, action: "follow" | "unfollow") {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = communityFollowSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const community = await prisma.community.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    select: { id: true },
  });
  if (!community) return NextResponse.json({ error: "community not found" }, { status: 404 });

  const result = await ingestCommunityList(parsed.data.signedCommunityListEvent, {
    expectedCommunityId: community.id,
    expectedIncluded: action === "follow",
  });
  if (result.status === "skipped") {
    return NextResponse.json({ error: result.reason ?? "invalid community list" }, { status: 400 });
  }
  if (result.status === "stored") publishToRelays(parsed.data.signedCommunityListEvent).catch(() => {});

  const following = await prisma.communityFollow.findUnique({
    where: {
      communityId_pubkey: {
        communityId: community.id,
        pubkey: parsed.data.signedCommunityListEvent.pubkey.toLowerCase(),
      },
    },
  });
  const followerCount = await prisma.communityFollow.count({ where: { communityId: community.id } });
  return NextResponse.json({ ok: true, following: !!following, followerCount });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(req, id, "follow");
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(req, id, "unfollow");
}
