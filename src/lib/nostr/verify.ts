// Server-side signature verification. We accept signed events from clients
// and must verify before mutating state.

import { verifyEvent, type Event as NostrToolsEvent } from "nostr-tools/pure";
import type { NostrEvent } from "./types";

export function verifyNostrEvent(evt: NostrEvent): boolean {
  // nostr-tools verifyEvent checks id matches the canonical hash AND signature.
  try {
    return verifyEvent(evt as unknown as NostrToolsEvent);
  } catch {
    return false;
  }
}

export function getTagValue(evt: NostrEvent, name: string): string | undefined {
  const tag = evt.tags.find((t) => t[0] === name);
  return tag?.[1];
}

export function getMultiTag(evt: NostrEvent, name: string): string[] {
  return evt.tags.filter((t) => t[0] === name).map((t) => t[1]).filter(Boolean);
}
