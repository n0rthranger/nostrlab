import "websocket-polyfill";
import { SimplePool, nip19, type Event } from "nostr-tools";

export const pool = new SimplePool();

export function shortenKey(hex: string): string {
  const npub = nip19.npubEncode(hex);
  return npub.slice(0, 8) + "..." + npub.slice(-4);
}

export async function queryEvents(
  relays: string[],
  filters: Record<string, unknown>[],
  timeoutMs = 8000,
): Promise<Event[]> {
  return pool.querySync(relays, filters as any, { maxWait: timeoutMs });
}

export function parseRepo(event: Event) {
  const getTag = (name: string) =>
    event.tags.find((t) => t[0] === name)?.[1] ?? "";
  const getAllTags = (name: string) =>
    event.tags.filter((t) => t[0] === name).map((t) => t[1]);

  return {
    id: event.id,
    pubkey: event.pubkey,
    identifier: getTag("d"),
    name: getTag("name") || getTag("d"),
    description: getTag("description"),
    cloneUrls: getAllTags("clone"),
    webUrls: getAllTags("web"),
    tags: getAllTags("t"),
    createdAt: event.created_at,
  };
}

export function parseIssue(event: Event) {
  const getTag = (name: string) =>
    event.tags.find((t) => t[0] === name)?.[1] ?? "";

  return {
    id: event.id,
    pubkey: event.pubkey,
    title: getTag("subject") || event.content.slice(0, 80),
    content: event.content,
    status: getTag("status") || "open",
    createdAt: event.created_at,
  };
}
