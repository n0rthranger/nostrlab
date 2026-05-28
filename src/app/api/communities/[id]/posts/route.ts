import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { communityPostSchema } from "@/lib/validation";
import { userToDTO } from "@/lib/dto";
import { getSessionPubkey } from "@/lib/session";
import { ingestCommunityPost } from "@/lib/nostr/community-moderation";
import { publishToRelays } from "@/lib/nostr/relay-pool";

export const dynamic = "force-dynamic";

async function loadCommunity(id: string) {
  return prisma.community.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: { moderators: true },
  });
}

function canModerate(community: NonNullable<Awaited<ReturnType<typeof loadCommunity>>>, pubkey: string | null): boolean {
  if (!pubkey) return false;
  return community.organizerPubkey === pubkey || community.moderators.some((moderator) => moderator.pubkey === pubkey);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const community = await loadCommunity(id);
  if (!community) return NextResponse.json({ error: "community not found" }, { status: 404 });
  const sessionPubkey = await getSessionPubkey();
  const moderator = canModerate(community, sessionPubkey);
  const posts = await prisma.communityPost.findMany({
    where: {
      communityId: community.id,
      ...(moderator ? {} : { approvedAt: { not: null } }),
    },
    orderBy: { createdAt: "desc" },
    take: moderator ? 100 : 50,
    include: { user: true, approvals: true },
  });
  return NextResponse.json({
    canModerate: moderator,
    posts: posts.map((post) => ({
      id: post.id,
      nostrId: post.nostrId,
      body: post.body,
      createdAt: post.createdAt.toISOString(),
      approvedAt: post.approvedAt?.toISOString() ?? null,
      user: userToDTO(post.user),
      approvalCount: post.approvals.length,
      rawEvent: moderator ? post.rawEvent : undefined,
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const community = await loadCommunity(id);
  if (!community) return NextResponse.json({ error: "community not found" }, { status: 404 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = communityPostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await ingestCommunityPost(parsed.data.signedPostEvent);
  if (result.status === "skipped" || !result.id) {
    return NextResponse.json({ error: result.reason ?? "post was not indexed" }, { status: 400 });
  }
  const post = await prisma.communityPost.findUnique({
    where: { id: result.id },
    include: { user: true, approvals: true },
  });
  if (!post || post.communityId !== community.id) {
    return NextResponse.json({ error: "post refers to a different community" }, { status: 400 });
  }
  if (result.status === "stored") publishToRelays(parsed.data.signedPostEvent).catch(() => {});
  return NextResponse.json({
    post: {
      id: post.id,
      nostrId: post.nostrId,
      body: post.body,
      createdAt: post.createdAt.toISOString(),
      approvedAt: post.approvedAt?.toISOString() ?? null,
      user: userToDTO(post.user),
      approvalCount: post.approvals.length,
    },
  });
}
