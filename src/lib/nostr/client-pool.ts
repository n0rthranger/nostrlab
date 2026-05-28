"use client";

// Browser-side relay publishing. Identical contract to server pool but
// runs against window.WebSocket and uses NEXT_PUBLIC_NOSTR_RELAYS.

import { SimplePool } from "nostr-tools/pool";
import type { NostrEvent } from "./types";
import { getClientRelays } from "./relays";
import { KIND_RELAY_LIST } from "./kinds";

let pool: SimplePool | null = null;
type RelayPrefs = { read: string[]; write: string[]; fetchedAt: number };
const relayPrefs = new Map<string, RelayPrefs>();
function getPool(): SimplePool {
  if (!pool) pool = new SimplePool();
  return pool;
}

export async function clientPublish(evt: NostrEvent): Promise<{ ok: number; failed: number }> {
  const relays = await publishTargets(evt);
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

function uniqueRelays(relays: string[]) {
  return Array.from(new Set(relays.filter((relay) => relay.startsWith("ws://") || relay.startsWith("wss://"))));
}

function parseRelayPrefs(evt: NostrEvent | null, fallback: string[]): RelayPrefs {
  if (!evt || evt.kind !== KIND_RELAY_LIST) return { read: fallback, write: fallback, fetchedAt: Date.now() };
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
  if (cached && Date.now() - cached.fetchedAt < 10 * 60 * 1000) return cached;
  const evt = await getPool().get(fallback, { kinds: [KIND_RELAY_LIST], authors: [pubkey] }, { maxWait: 1200 })
    .catch(() => null) as NostrEvent | null;
  const prefs = parseRelayPrefs(evt, fallback);
  relayPrefs.set(pubkey, prefs);
  return prefs;
}

async function publishTargets(evt: NostrEvent): Promise<string[]> {
  const base = getClientRelays();
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
