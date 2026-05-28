// Server-side relay publishing. Best-effort — we don't block the API response
// on relay acks; we publish in the background and let the index settle from the
// signed event we already verified.

import { SimplePool } from "nostr-tools/pool";
import { useWebSocketImplementation as setWebSocketImplementation } from "nostr-tools/relay";
import type { NostrEvent } from "./types";
import { getServerRelays } from "./relays";
import { KIND_RELAY_LIST } from "./kinds";

// nostr-tools needs an explicit WebSocket impl on Node. Even on Node 22 with
// global WebSocket, providing `ws` matches its docs and avoids edge-case bugs.
import WebSocketImpl from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  setWebSocketImplementation(WebSocketImpl);
}

let pool: SimplePool | null = null;
type RelayPrefs = { read: string[]; write: string[]; fetchedAt: number };
const relayPrefs = new Map<string, RelayPrefs>();
const RELAY_PREF_TTL_MS = 10 * 60 * 1000;
const publishStats = {
  attempts: 0,
  ok: 0,
  failed: 0,
  lastRelays: [] as string[],
  lastEventId: null as string | null,
  lastPublishedAt: null as string | null,
};

function getPool(): SimplePool {
  if (!pool) pool = new SimplePool();
  return pool;
}

export function closeRelayPool() {
  if (!pool) return;
  pool.destroy();
  pool = null;
}

function uniqueRelays(relays: string[]): string[] {
  return Array.from(new Set(relays.filter((relay) => relay.startsWith("ws://") || relay.startsWith("wss://"))));
}

function parseRelayPrefs(evt: NostrEvent | null, fallback: string[]): RelayPrefs {
  if (!evt || evt.kind !== KIND_RELAY_LIST) {
    return { read: fallback, write: fallback, fetchedAt: Date.now() };
  }
  const read: string[] = [];
  const write: string[] = [];
  for (const tag of evt.tags) {
    if (tag[0] !== "r" || !tag[1]) continue;
    if (tag[2] === "read") read.push(tag[1]);
    else if (tag[2] === "write") write.push(tag[1]);
    else {
      read.push(tag[1]);
      write.push(tag[1]);
    }
  }
  return {
    read: uniqueRelays(read.length ? read : fallback),
    write: uniqueRelays(write.length ? write : fallback),
    fetchedAt: Date.now(),
  };
}

async function fetchRelayPrefs(pubkey: string, fallback: string[]): Promise<RelayPrefs> {
  const cached = relayPrefs.get(pubkey);
  if (cached && Date.now() - cached.fetchedAt < RELAY_PREF_TTL_MS) return cached;
  const p = getPool();
  const evt = await p.get(fallback, { kinds: [KIND_RELAY_LIST], authors: [pubkey] }, { maxWait: 1500 })
    .catch(() => null) as NostrEvent | null;
  const prefs = parseRelayPrefs(evt, fallback);
  relayPrefs.set(pubkey, prefs);
  return prefs;
}

async function publishTargets(evt: NostrEvent): Promise<string[]> {
  const base = getServerRelays();
  const relays = new Set(base);
  const authorPrefs = await fetchRelayPrefs(evt.pubkey.toLowerCase(), base);
  for (const relay of authorPrefs.write) relays.add(relay);

  const taggedPubkeys = Array.from(new Set(
    evt.tags.filter((tag) => tag[0] === "p" && /^[0-9a-f]{64}$/i.test(tag[1] ?? ""))
      .map((tag) => tag[1].toLowerCase())
      .slice(0, 8)
  ));
  await Promise.all(taggedPubkeys.map(async (pubkey) => {
    const prefs = await fetchRelayPrefs(pubkey, base);
    for (const relay of prefs.read) relays.add(relay);
  }));

  return uniqueRelays([...relays]).slice(0, 20);
}

export async function publishToRelays(evt: NostrEvent): Promise<{ ok: number; failed: number }> {
  const relays = await publishTargets(evt);
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
  publishStats.attempts += 1;
  publishStats.ok += ok;
  publishStats.failed += failed;
  publishStats.lastRelays = relays;
  publishStats.lastEventId = evt.id;
  publishStats.lastPublishedAt = new Date().toISOString();
  return { ok, failed };
}

export function relayPoolStats() {
  return {
    ...publishStats,
    relayPreferenceCacheSize: relayPrefs.size,
  };
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
