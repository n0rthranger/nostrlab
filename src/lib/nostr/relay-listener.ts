// Long-lived relay subscriptions:
// - kind:31923 NIP-52 event listings from the wider Nostr network
// - kind:31925 RSVPs referencing any event we have indexed
//
// Both feed through ingest policy gates before they touch the database.
//
// Booted lazily on first use (or via Next.js instrumentation). Singleton state
// lives on globalThis so it survives module reloads in dev.

import { SimplePool } from "nostr-tools/pool";
import WebSocketImpl from "ws";
import { useWebSocketImplementation as setWebSocketImplementation } from "nostr-tools/relay";
import { prisma } from "@/lib/prisma";
import { getServerRelays } from "./relays";
import { KIND_RSVP, KIND_EVENT_LISTING, KIND_EVENT_DELETION } from "./kinds";
import type { NostrEvent } from "./types";
import { ingestRsvp } from "./ingest-rsvp";
import { ingestEventListing } from "./ingest-event";
import { ingestEventDeletion } from "./ingest-deletion";

if (typeof globalThis.WebSocket === "undefined") {
  setWebSocketImplementation(WebSocketImpl);
}

const STORE_KEY = "__nostrlab_relay_listener__" as const;
type Closer = { close: () => void };
type IngestStats = { stored: number; skipped: number; older: number; duplicate: number; failed: number };
type ListenerState = {
  pool: SimplePool;
  eventSub: Closer | null;
  deletionSub: Closer | null;
  rsvpSub: Closer | null;
  refreshTimer: NodeJS.Timeout | null;
  lastCoordsKey: string;
  availableCoordinates: number;
  lastEventSeenSec: number;
  lastDeletionSeenSec: number;
  lastRsvpSeenSec: number;
  startedAt: number;
  stats: { events: IngestStats; deletions: IngestStats; rsvps: IngestStats };
  eventLimiter: TaskLimiter;
  deletionLimiter: TaskLimiter;
  rsvpLimiter: TaskLimiter;
};
type GlobalWithListener = typeof globalThis & { [STORE_KEY]?: ListenerState };

const REFRESH_INTERVAL_MS = 60_000;
const SINCE_LOOKBACK_SEC = 24 * 3600;
const RSVP_COORD_LOOKBACK_MS = 30 * 86400 * 1000;

type TaskLimiter = {
  run: (task: () => Promise<void>) => void;
  stats: () => { active: number; queued: number; concurrency: number };
};

function emptyStats(): IngestStats {
  return { stored: 0, skipped: 0, older: 0, duplicate: 0, failed: 0 };
}

function positiveIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function createTaskLimiter(name: string, concurrency: number): TaskLimiter {
  let active = 0;
  const queue: Array<() => void> = [];

  const drain = () => {
    while (active < concurrency && queue.length > 0) {
      const start = queue.shift()!;
      start();
    }
  };

  return {
    run(task) {
      queue.push(() => {
        active += 1;
        task()
          .catch((e) => {
            console.warn(`[relay-listener] ${name} task failed:`, (e as Error).message);
          })
          .finally(() => {
            active -= 1;
            drain();
          });
      });
      drain();
    },
    stats() {
      return { active, queued: queue.length, concurrency };
    },
  };
}

function getState(): ListenerState {
  const g = globalThis as GlobalWithListener;
  if (!g[STORE_KEY]) {
    const eventConcurrency = positiveIntEnv("NOSTRLAB_RELAY_EVENT_INGEST_CONCURRENCY", 4, 1, 32);
    const deletionConcurrency = positiveIntEnv("NOSTRLAB_RELAY_DELETION_INGEST_CONCURRENCY", 4, 1, 32);
    const rsvpConcurrency = positiveIntEnv("NOSTRLAB_RELAY_RSVP_INGEST_CONCURRENCY", 8, 1, 64);
    g[STORE_KEY] = {
      pool: new SimplePool(),
      eventSub: null,
      deletionSub: null,
      rsvpSub: null,
      refreshTimer: null,
      lastCoordsKey: "",
      availableCoordinates: 0,
      lastEventSeenSec: 0,
      lastDeletionSeenSec: 0,
      lastRsvpSeenSec: 0,
      startedAt: Math.floor(Date.now() / 1000),
      stats: { events: emptyStats(), deletions: emptyStats(), rsvps: emptyStats() },
      eventLimiter: createTaskLimiter("event ingest", eventConcurrency),
      deletionLimiter: createTaskLimiter("deletion ingest", deletionConcurrency),
      rsvpLimiter: createTaskLimiter("rsvp ingest", rsvpConcurrency),
    };
  }
  return g[STORE_KEY]!;
}

async function loadCoordinates(): Promise<{ coords: string[]; available: number }> {
  const limit = positiveIntEnv("NOSTRLAB_RELAY_RSVP_COORD_LIMIT", 500, 1, 5000);
  const now = new Date();
  const lowerBound = new Date(now.getTime() - RSVP_COORD_LOOKBACK_MS);

  const upcoming = await prisma.event.findMany({
    select: { organizerPubkey: true, dTag: true },
    where: { startsAt: { gte: now }, duplicateOfId: null },
    orderBy: { startsAt: "asc" },
    take: limit,
  });
  const recent = upcoming.length >= limit ? [] : await prisma.event.findMany({
    select: { organizerPubkey: true, dTag: true },
    where: {
      startsAt: { gte: lowerBound, lt: now },
      duplicateOfId: null,
    },
    orderBy: { startsAt: "desc" },
    take: limit - upcoming.length,
  });

  const available = await prisma.event.count({
    where: { startsAt: { gte: lowerBound }, duplicateOfId: null },
  });

  const events = [...upcoming, ...recent];
  const coords = events.map((e) => `${KIND_EVENT_LISTING}:${e.organizerPubkey}:${e.dTag}`);
  coords.sort();
  return { coords, available };
}

async function ensureEventSubscription() {
  const state = getState();
  if (state.eventSub) return;

  const since = state.lastEventSeenSec > 0
    ? state.lastEventSeenSec - 60
    : state.startedAt - SINCE_LOOKBACK_SEC;

  const relays = getServerRelays();
  console.info(
    `[relay-listener] subscribing to ${relays.length} relays for global kind:${KIND_EVENT_LISTING} events (since ${new Date(since * 1000).toISOString()})`
  );

  state.eventSub = state.pool.subscribeMany(
    relays,
    { kinds: [KIND_EVENT_LISTING], since },
    {
      onevent: async (raw) => {
        const evt = raw as unknown as NostrEvent;
        state.eventLimiter.run(async () => {
          try {
            const result = await ingestEventListing(evt);
            state.stats.events[result.status] = (state.stats.events[result.status] ?? 0) + 1;
            if (evt.created_at > state.lastEventSeenSec) state.lastEventSeenSec = evt.created_at;
            if (result.status === "stored") {
              console.info(
                `[relay-listener] indexed event ${evt.id.slice(0, 12)}… source=${result.source} score=${result.relevance?.score ?? "n/a"}`
              );
            }
          } catch (e) {
            state.stats.events.failed += 1;
            console.warn(`[relay-listener] event ingest failed for ${evt.id.slice(0, 12)}…: ${(e as Error).message}`);
          }
        });
      },
      oneose: () => { /* end of stored events on a relay — we keep listening */ },
    }
  );
}

async function ensureDeletionSubscription() {
  const state = getState();
  if (state.deletionSub) return;

  const since = state.lastDeletionSeenSec > 0
    ? state.lastDeletionSeenSec - 60
    : state.startedAt - SINCE_LOOKBACK_SEC;

  const relays = getServerRelays();
  console.info(
    `[relay-listener] subscribing to ${relays.length} relays for kind:${KIND_EVENT_DELETION} deletions (since ${new Date(since * 1000).toISOString()})`
  );

  state.deletionSub = state.pool.subscribeMany(
    relays,
    { kinds: [KIND_EVENT_DELETION], since },
    {
      onevent: async (raw) => {
        const evt = raw as unknown as NostrEvent;
        state.deletionLimiter.run(async () => {
          try {
            const result = await ingestEventDeletion(evt, { hardDeleteInactive: true });
            state.stats.deletions[result.status] = (state.stats.deletions[result.status] ?? 0) + 1;
            if (evt.created_at > state.lastDeletionSeenSec) state.lastDeletionSeenSec = evt.created_at;
            if (result.status === "stored") {
              console.info(`[relay-listener] processed deletion ${evt.id.slice(0, 12)}… targets=${result.targets.length}`);
            }
          } catch (e) {
            state.stats.deletions.failed += 1;
            console.warn(`[relay-listener] deletion ingest failed for ${evt.id.slice(0, 12)}…: ${(e as Error).message}`);
          }
        });
      },
      oneose: () => { /* keep listening */ },
    }
  );
}

async function refreshRsvpSubscription() {
  const state = getState();
  const { coords, available } = await loadCoordinates();
  const key = coords.join("|");
  state.availableCoordinates = available;
  if (key === state.lastCoordsKey && state.rsvpSub) return; // nothing changed
  state.lastCoordsKey = key;

  if (state.rsvpSub) {
    try { state.rsvpSub.close(); } catch { /* ignore */ }
    state.rsvpSub = null;
  }

  if (coords.length === 0) {
    console.info("[relay-listener] no events to watch yet — idle");
    return;
  }

  const since = state.lastRsvpSeenSec > 0
    ? state.lastRsvpSeenSec - 60
    : state.startedAt - SINCE_LOOKBACK_SEC;

  const relays = getServerRelays();
  console.info(
    `[relay-listener] subscribing to ${relays.length} relays for ${coords.length}/${available} event coordinates (since ${new Date(since * 1000).toISOString()})`
  );

  state.rsvpSub = state.pool.subscribeMany(
    relays,
    { kinds: [KIND_RSVP], "#a": coords, since },
    {
      onevent: async (raw) => {
        const evt = raw as unknown as NostrEvent;
        state.rsvpLimiter.run(async () => {
          try {
            const result = await ingestRsvp(evt);
            state.stats.rsvps[result] = (state.stats.rsvps[result] ?? 0) + 1;
            if (evt.created_at > state.lastRsvpSeenSec) state.lastRsvpSeenSec = evt.created_at;
            if (result === "stored") {
              console.info(`[relay-listener] ingested RSVP ${evt.id.slice(0, 12)}… from ${evt.pubkey.slice(0, 12)}…`);
            }
          } catch (e) {
            state.stats.rsvps.failed += 1;
            console.warn(`[relay-listener] ingest failed for ${evt.id.slice(0, 12)}…: ${(e as Error).message}`);
          }
        });
      },
      oneose: () => { /* end of stored events on a relay — we keep listening */ },
    }
  );
}

let booted = false;
export async function ensureRelayListener(): Promise<void> {
  if (booted) return;
  booted = true;
  const state = getState();
  try {
    await ensureEventSubscription();
    await ensureDeletionSubscription();
    await refreshRsvpSubscription();
    state.refreshTimer = setInterval(() => {
      ensureEventSubscription().catch((e) => {
        console.warn("[relay-listener] event subscription failed:", (e as Error).message);
      });
      ensureDeletionSubscription().catch((e) => {
        console.warn("[relay-listener] deletion subscription failed:", (e as Error).message);
      });
      refreshRsvpSubscription().catch((e) => {
        console.warn("[relay-listener] refresh failed:", (e as Error).message);
      });
    }, REFRESH_INTERVAL_MS);
    if (typeof state.refreshTimer.unref === "function") state.refreshTimer.unref();
  } catch (e) {
    console.warn("[relay-listener] boot failed:", (e as Error).message);
    booted = false; // allow retry on next call
  }
}

export function listenerStats() {
  const state = getState();
  return {
    started: !!state.eventSub || !!state.deletionSub || !!state.rsvpSub,
    eventsStarted: !!state.eventSub,
    deletionsStarted: !!state.deletionSub,
    rsvpsStarted: !!state.rsvpSub,
    coordinates: state.lastCoordsKey ? state.lastCoordsKey.split("|").length : 0,
    availableCoordinates: state.availableCoordinates,
    lastEventSeenSec: state.lastEventSeenSec,
    lastDeletionSeenSec: state.lastDeletionSeenSec,
    lastRsvpSeenSec: state.lastRsvpSeenSec,
    stats: state.stats,
    queue: {
      events: state.eventLimiter.stats(),
      deletions: state.deletionLimiter.stats(),
      rsvps: state.rsvpLimiter.stats(),
    },
  };
}
