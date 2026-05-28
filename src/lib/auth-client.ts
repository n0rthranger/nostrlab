import { canonicalJson } from "@/lib/stable-json";
import type { UnsignedEvent, NostrEvent } from "@/lib/nostr/types";

export async function hashAuthPayload(value: Parameters<typeof canonicalJson>[0]): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function authUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

export async function buildNip98AuthEvent({
  pubkey,
  url,
  method,
  payload,
  tags = [],
}: {
  pubkey: string;
  url: string;
  method: string;
  payload?: Parameters<typeof canonicalJson>[0];
  tags?: string[][];
}): Promise<UnsignedEvent> {
  const nextTags = [
    ["u", url],
    ["method", method.toUpperCase()],
    ...tags,
  ];
  if (payload !== undefined) nextTags.push(["payload", await hashAuthPayload(payload)]);
  return {
    pubkey,
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    content: "",
    tags: nextTags,
  };
}

export function nip98AuthorizationHeader(evt: NostrEvent): string {
  return `Nostr ${btoa(JSON.stringify(evt))}`;
}
