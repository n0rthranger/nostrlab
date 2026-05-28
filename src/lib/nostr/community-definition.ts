import { KIND_COMMUNITY } from "./kinds";
import type { NostrEvent } from "./types";
import { getMultiTag, getTagValue, verifyNostrEvent } from "./verify";

export interface CommunityDefinitionExpectation {
  pubkey: string;
  slug: string;
  name: string;
  description: string;
  imageUrls?: string[];
  website?: string | null;
  tags?: string[];
  moderatorPubkeys?: string[];
}

function sameSet(a: string[], b: string[]): boolean {
  const left = new Set(a.map((v) => v.toLowerCase()));
  const right = new Set(b.map((v) => v.toLowerCase()));
  if (left.size !== right.size) return false;
  for (const item of left) {
    if (!right.has(item)) return false;
  }
  return true;
}

export function communityCoordinate(pubkey: string, slug: string): string {
  return `${KIND_COMMUNITY}:${pubkey}:${slug}`;
}

export function validateCommunityDefinition(
  evt: NostrEvent | undefined,
  expected: CommunityDefinitionExpectation
): string | null {
  if (!evt) return null;
  if (!verifyNostrEvent(evt)) return "community definition signature is invalid";
  if (evt.kind !== KIND_COMMUNITY) return "community definition has the wrong kind";
  if (evt.pubkey.toLowerCase() !== expected.pubkey.toLowerCase()) {
    return "community definition signer does not match the community owner";
  }
  if (getTagValue(evt, "d") !== expected.slug) return "community definition slug mismatch";
  if (getTagValue(evt, "name") !== expected.name) return "community definition name mismatch";
  if (getTagValue(evt, "description") !== expected.description) {
    return "community definition description mismatch";
  }

  const image = getTagValue(evt, "image");
  const imageUrls = expected.imageUrls?.filter(Boolean) ?? [];
  if (imageUrls.length > 0 && (!image || !imageUrls.includes(image))) {
    return "community definition image mismatch";
  }
  if (imageUrls.length === 0 && image) return "community definition has an unexpected image";

  const website = getTagValue(evt, "r");
  if ((expected.website ?? null) !== (website ?? null)) {
    return "community definition website mismatch";
  }

  const expectedTags = (expected.tags ?? []).map((t) => t.toLowerCase());
  const actualTags = getMultiTag(evt, "t").filter((t) => t !== "nostrlab").map((t) => t.toLowerCase());
  if (!sameSet(actualTags, expectedTags)) return "community definition tags mismatch";

  const expectedModerators = [
    expected.pubkey,
    ...(expected.moderatorPubkeys ?? []),
  ].map((p) => p.toLowerCase());
  const actualModerators = evt.tags
    .filter((tag) => tag[0] === "p" && tag[3] === "moderator")
    .map((tag) => tag[1]?.toLowerCase())
    .filter((pubkey): pubkey is string => !!pubkey);
  if (!sameSet(actualModerators, expectedModerators)) {
    return "community definition moderator list mismatch";
  }

  return null;
}
