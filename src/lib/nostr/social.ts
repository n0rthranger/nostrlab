import type { NostrEvent } from "./types";
import { getMultiTag, getTagValue } from "./verify";
import { KIND_COMMENT, KIND_COMMUNITY, KIND_COMMUNITY_LIST, KIND_EVENT_LISTING } from "./kinds";
import { parseNostrCoordinate } from "./coordinates";

export interface ParsedEventComment {
  nostrId: string;
  pubkey: string;
  eventCoordinate: string;
  eventNostrId?: string;
  organizerPubkey?: string;
  body: string;
  title?: string;
  isAnnouncement: boolean;
}

export interface ParsedCommunityList {
  nostrId: string;
  pubkey: string;
  communityCoordinates: string[];
}

function tagValues(evt: NostrEvent, name: string): string[] {
  return evt.tags.filter((tag) => tag[0] === name).map((tag) => tag[1]).filter(Boolean);
}

function firstEventCoordinate(evt: NostrEvent): string | undefined {
  return [
    ...tagValues(evt, "a"),
    ...tagValues(evt, "A"),
  ].find((value) => !!parseNostrCoordinate(value, KIND_EVENT_LISTING));
}

export function parseEventComment(evt: NostrEvent): ParsedEventComment {
  if (evt.kind !== KIND_COMMENT) throw new Error(`wrong kind: ${evt.kind}`);

  const eventCoordinate = firstEventCoordinate(evt);
  if (!eventCoordinate) throw new Error("comment missing event coordinate");

  const rootKind = getTagValue(evt, "K");
  const parentKind = getTagValue(evt, "k");
  if (rootKind !== String(KIND_EVENT_LISTING) || parentKind !== String(KIND_EVENT_LISTING)) {
    throw new Error("comment is not scoped to an event listing");
  }

  const body = evt.content.trim();
  if (!body) throw new Error("comment body is required");
  if (body.length > 5000) throw new Error("comment body is too long");

  const title = (getTagValue(evt, "title") ?? getTagValue(evt, "subject"))?.trim();
  const isAnnouncement = getMultiTag(evt, "t").some((tag) => tag.toLowerCase() === "announcement") || !!title;
  if (!isAnnouncement && body.length > 2000) throw new Error("comment body is too long");
  if (isAnnouncement && title && title.length > 120) throw new Error("announcement title is too long");

  return {
    nostrId: evt.id,
    pubkey: evt.pubkey.toLowerCase(),
    eventCoordinate,
    eventNostrId: getTagValue(evt, "e"),
    organizerPubkey: getTagValue(evt, "p")?.toLowerCase() ?? getTagValue(evt, "P")?.toLowerCase(),
    body,
    title: title || undefined,
    isAnnouncement,
  };
}

export function parseCommunityList(evt: NostrEvent): ParsedCommunityList {
  if (evt.kind !== KIND_COMMUNITY_LIST) throw new Error(`wrong kind: ${evt.kind}`);
  const communityCoordinates = Array.from(new Set(
    tagValues(evt, "a").filter((value) => !!parseNostrCoordinate(value, KIND_COMMUNITY))
  )).sort();
  return {
    nostrId: evt.id,
    pubkey: evt.pubkey.toLowerCase(),
    communityCoordinates,
  };
}
