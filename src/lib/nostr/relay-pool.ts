// Server-side relay publishing. Best-effort — we don't block the API response
// on relay acks; we publish in the background and let the index settle from the
// signed event we already verified.

import { SimplePool } from "nostr-tools/pool";
import { useWebSocketImplementation as setWebSocketImplementation } from "nostr-tools/relay";
import type { NostrEvent } from "./types";
import { getServerRelays } from "./relays";

// nostr-tools needs an explicit WebSocket impl on Node. Even on Node 22 with
// global WebSocket, providing `ws` matches its docs and avoids edge-case bugs.
import WebSocketImpl from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  setWebSocketImplementation(WebSocketImpl);
}

let pool: SimplePool | null = null;

function getPool(): SimplePool {
  if (!pool) pool = new SimplePool();
  return pool;
}

export function closeRelayPool() {
  if (!pool) return;
  pool.destroy();
  pool = null;
}

export async function publishToRelays(evt: NostrEvent): Promise<{ ok: number; failed: number }> {
  const relays = getServerRelays();
  const p = getPool();
  let ok = 0;
  let failed = 0;
  await Promise.allSettled(
    p.publish(relays, evt as Parameters<SimplePool["publish"]>[1]).map((promise) =>
      promise.then(
        () => { ok++; },
        () => { failed++; }
      )
    )
  );
  return { ok, failed };
}

export async function fetchProfileMetadata(pubkey: string): Promise<NostrEvent | null> {
  const relays = getServerRelays();
  const p = getPool();
  try {
    const ev = await p.get(relays, { kinds: [0], authors: [pubkey] }, { maxWait: 3000 });
    return (ev as NostrEvent | null) ?? null;
  } catch {
    return null;
  }
}
