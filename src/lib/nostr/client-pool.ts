"use client";

// Browser-side relay publishing. Identical contract to server pool but
// runs against window.WebSocket and uses NEXT_PUBLIC_NOSTR_RELAYS.

import { SimplePool } from "nostr-tools/pool";
import type { NostrEvent } from "./types";
import { getClientRelays } from "./relays";

let pool: SimplePool | null = null;
function getPool(): SimplePool {
  if (!pool) pool = new SimplePool();
  return pool;
}

export async function clientPublish(evt: NostrEvent): Promise<{ ok: number; failed: number }> {
  const relays = getClientRelays();
  const p = getPool();
  let ok = 0;
  let failed = 0;
  await Promise.allSettled(
    p.publish(relays, evt as Parameters<SimplePool["publish"]>[1]).map((r) =>
      r.then(() => { ok++; }, () => { failed++; })
    )
  );
  return { ok, failed };
}
