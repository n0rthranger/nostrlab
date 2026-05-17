import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuthEnvelope } from "@/lib/auth";
import { nostrEventSchema } from "@/lib/validation";
import { ensureUser } from "@/lib/nostr/profile";

const followSchema = z.object({
  signedAuthEvent: nostrEventSchema,
});

async function handle(req: Request, id: string, action: "follow" | "unfollow") {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = followSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const community = await prisma.community.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    select: { id: true },
  });
  if (!community) return NextResponse.json({ error: "community not found" }, { status: 404 });

  const auth = verifyAuthEnvelope(parsed.data.signedAuthEvent, {
    expectedAction: action === "follow" ? "community.follow" : "community.unfollow",
    expectedTags: { community_id: community.id },
    expectedPayload: { communityId: community.id },
  });
  if (!auth.ok || !auth.pubkey) return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: 401 });

  await ensureUser(auth.pubkey);
  if (action === "follow") {
    await prisma.communityFollow.upsert({
      where: { communityId_pubkey: { communityId: community.id, pubkey: auth.pubkey } },
      create: { communityId: community.id, pubkey: auth.pubkey },
      update: {},
    });
  } else {
    await prisma.communityFollow.delete({
      where: { communityId_pubkey: { communityId: community.id, pubkey: auth.pubkey } },
    }).catch(() => {});
  }
  const followerCount = await prisma.communityFollow.count({ where: { communityId: community.id } });
  return NextResponse.json({ ok: true, following: action === "follow", followerCount });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(req, id, "follow");
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(req, id, "unfollow");
}
