import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isBanned } from "@/lib/moderation";
import type { NostrEvent } from "./types";
import { parseNostrCoordinate } from "./coordinates";
import { KIND_COMMENT, KIND_COMMUNITY, KIND_COMMUNITY_APPROVAL } from "./kinds";
import { verifyNostrEvent, getTagValue } from "./verify";
import { ensureUser } from "./profile";

export type CommunityModerationStatus = "stored" | "skipped" | "duplicate";

export interface ParsedCommunityPost {
  nostrId: string;
  pubkey: string;
  communityCoordinate: string;
  body: string;
}

export interface ParsedCommunityApproval {
  nostrId: string;
  pubkey: string;
  communityCoordinate: string;
  postNostrId: string;
  postAuthorPubkey?: string;
}

function communityCoordinateFromTags(evt: NostrEvent): string | undefined {
  return [
    ...evt.tags.filter((tag) => tag[0] === "a").map((tag) => tag[1]),
    ...evt.tags.filter((tag) => tag[0] === "A").map((tag) => tag[1]),
  ].find((coord) => !!parseNostrCoordinate(coord, KIND_COMMUNITY));
}

export function parseCommunityPost(evt: NostrEvent): ParsedCommunityPost {
  if (evt.kind !== KIND_COMMENT) throw new Error(`wrong kind: ${evt.kind}`);
  const communityCoordinate = communityCoordinateFromTags(evt);
  if (!communityCoordinate) throw new Error("community post missing community coordinate");
  const rootKind = getTagValue(evt, "K");
  const parentKind = getTagValue(evt, "k");
  if (rootKind !== String(KIND_COMMUNITY) || parentKind !== String(KIND_COMMUNITY)) {
    throw new Error("post is not scoped to a NIP-72 community");
  }
  const body = evt.content.trim();
  if (!body) throw new Error("post body is required");
  if (body.length > 5000) throw new Error("post body is too long");
  return {
    nostrId: evt.id,
    pubkey: evt.pubkey.toLowerCase(),
    communityCoordinate,
    body,
  };
}

export function parseCommunityApproval(evt: NostrEvent): ParsedCommunityApproval {
  if (evt.kind !== KIND_COMMUNITY_APPROVAL) throw new Error(`wrong kind: ${evt.kind}`);
  const communityCoordinate = communityCoordinateFromTags(evt);
  const postNostrId = getTagValue(evt, "e");
  if (!communityCoordinate) throw new Error("approval missing community coordinate");
  if (!postNostrId) throw new Error("approval missing post reference");
  return {
    nostrId: evt.id,
    pubkey: evt.pubkey.toLowerCase(),
    communityCoordinate,
    postNostrId,
    postAuthorPubkey: getTagValue(evt, "p")?.toLowerCase(),
  };
}

async function communityForCoordinate(coord: string) {
  const parsed = parseNostrCoordinate(coord, KIND_COMMUNITY);
  if (!parsed) return null;
  return prisma.community.findFirst({
    where: { organizerPubkey: parsed.pubkey, slug: parsed.dTag },
    include: { moderators: true },
  });
}

function canModerate(community: Awaited<ReturnType<typeof communityForCoordinate>>, pubkey: string): boolean {
  if (!community) return false;
  return community.organizerPubkey === pubkey || community.moderators.some((moderator) => moderator.pubkey === pubkey);
}

export async function ingestCommunityPost(evt: NostrEvent): Promise<{ status: CommunityModerationStatus; id?: string; reason?: string }> {
  if (!verifyNostrEvent(evt)) throw new Error("invalid signature");
  if (await isBanned(evt.pubkey.toLowerCase())) return { status: "skipped", reason: "banned" };
  let parsed;
  try { parsed = parseCommunityPost(evt); }
  catch (e) { return { status: "skipped", reason: (e as Error).message }; }
  const community = await communityForCoordinate(parsed.communityCoordinate);
  if (!community) return { status: "skipped", reason: "community not indexed" };
  const existing = await prisma.communityPost.findUnique({ where: { nostrId: parsed.nostrId }, select: { id: true } });
  if (existing) return { status: "duplicate", id: existing.id };
  await ensureUser(parsed.pubkey).catch(() => {});
  const post = await prisma.communityPost.create({
    data: {
      communityId: community.id,
      pubkey: parsed.pubkey,
      body: parsed.body,
      nostrId: parsed.nostrId,
      rawEvent: evt as unknown as Prisma.InputJsonValue,
      approvedAt: canModerate(community, parsed.pubkey) ? new Date() : null,
      createdAt: new Date(Math.max(0, evt.created_at * 1000)),
    },
  });
  return { status: "stored", id: post.id };
}

export async function ingestCommunityApproval(evt: NostrEvent): Promise<{ status: CommunityModerationStatus; id?: string; reason?: string }> {
  if (!verifyNostrEvent(evt)) throw new Error("invalid signature");
  if (await isBanned(evt.pubkey.toLowerCase())) return { status: "skipped", reason: "banned" };
  let parsed;
  try { parsed = parseCommunityApproval(evt); }
  catch (e) { return { status: "skipped", reason: (e as Error).message }; }
  const community = await communityForCoordinate(parsed.communityCoordinate);
  if (!community) return { status: "skipped", reason: "community not indexed" };
  if (!canModerate(community, parsed.pubkey)) return { status: "skipped", reason: "not a moderator" };
  const post = await prisma.communityPost.findUnique({ where: { nostrId: parsed.postNostrId } });
  if (!post || post.communityId !== community.id) return { status: "skipped", reason: "post not indexed" };
  await ensureUser(parsed.pubkey).catch(() => {});
  const approval = await prisma.communityPostApproval.upsert({
    where: { postId_pubkey: { postId: post.id, pubkey: parsed.pubkey } },
    create: {
      postId: post.id,
      communityId: community.id,
      pubkey: parsed.pubkey,
      nostrId: parsed.nostrId,
      rawEvent: evt as unknown as Prisma.InputJsonValue,
      createdAt: new Date(Math.max(0, evt.created_at * 1000)),
    },
    update: {
      nostrId: parsed.nostrId,
      rawEvent: evt as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.communityPost.update({
    where: { id: post.id },
    data: { approvedAt: post.approvedAt ?? new Date() },
  });
  return { status: "stored", id: approval.id };
}
