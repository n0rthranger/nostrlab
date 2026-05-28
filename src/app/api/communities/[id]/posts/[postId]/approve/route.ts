import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { communityPostApprovalSchema } from "@/lib/validation";
import { ingestCommunityApproval } from "@/lib/nostr/community-moderation";
import { publishToRelays } from "@/lib/nostr/relay-pool";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  const { id, postId } = await params;
  const post = await prisma.communityPost.findFirst({
    where: { id: postId, community: { OR: [{ id }, { slug: id }] } },
    select: { id: true },
  });
  if (!post) return NextResponse.json({ error: "post not found" }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = communityPostApprovalSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await ingestCommunityApproval(parsed.data.signedApprovalEvent);
  if (result.status === "skipped") {
    const status = result.reason === "not a moderator" ? 403 : 400;
    return NextResponse.json({ error: result.reason ?? "approval was not indexed" }, { status });
  }
  if (result.id) {
    const approval = await prisma.communityPostApproval.findUnique({
      where: { id: result.id },
      select: { postId: true },
    });
    if (approval?.postId !== post.id) {
      return NextResponse.json({ error: "approval refers to a different post" }, { status: 400 });
    }
  }
  publishToRelays(parsed.data.signedApprovalEvent).catch(() => {});
  return NextResponse.json({ ok: true, approvalId: result.id });
}
