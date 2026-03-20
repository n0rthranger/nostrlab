import { openDB, type IDBPDatabase } from "idb";
import { type Event } from "nostr-tools";

interface CachedQuery {
  key: string;
  eventIds: string[];
  cachedAt: number;
  ttl: number;
}

interface CachedEvent {
  id: string;
  event: Event;
  cachedAt: number;
}

const DB_NAME = "nostrlab-cache";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("events")) {
          db.createObjectStore("events", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("queries")) {
          db.createObjectStore("queries", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

// Simple string hash for cache keys
function hashFilter(filter: Record<string, unknown>): string {
  const str = JSON.stringify(filter, Object.keys(filter).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return "q_" + (hash >>> 0).toString(36);
}

// TTL presets in seconds
export const TTL = {
  PROFILE: 24 * 3600,    // 24h
  REPO: 3600,            // 1h
  LIST: 300,             // 5min (issues, patches, etc.)
  ACTIVITY: 120,         // 2min
} as const;

export async function getCached<T>(
  filter: Record<string, unknown>,
  parser: (events: Event[]) => T[],
): Promise<{ data: T[]; stale: boolean } | null> {
  try {
    const db = await getDB();
    const key = hashFilter(filter);
    const query = await db.get("queries", key) as CachedQuery | undefined;
    if (!query) return null;

    const now = Date.now() / 1000;
    const age = now - query.cachedAt;
    const stale = age > query.ttl;

    const events: Event[] = [];
    for (const id of query.eventIds) {
      const cached = await db.get("events", id) as CachedEvent | undefined;
      if (cached) events.push(cached.event);
    }

    if (events.length === 0) return null;
    return { data: parser(events), stale };
  } catch {
    return null;
  }
}

export async function putCache(
  filter: Record<string, unknown>,
  events: Event[],
  ttl: number,
): Promise<void> {
  try {
    const db = await getDB();
    const key = hashFilter(filter);
    const now = Date.now() / 1000;

    const tx = db.transaction(["events", "queries"], "readwrite");
    const eventStore = tx.objectStore("events");
    const queryStore = tx.objectStore("queries");

    for (const event of events) {
      await eventStore.put({ id: event.id, event, cachedAt: now } as CachedEvent);
    }

    await queryStore.put({
      key,
      eventIds: events.map((e) => e.id),
      cachedAt: now,
      ttl,
    } as CachedQuery);

    await tx.done;
  } catch {
    // cache write failure is non-fatal
  }
}

export async function getLatestTimestamp(filter: Record<string, unknown>): Promise<number | null> {
  try {
    const db = await getDB();
    const key = hashFilter(filter);
    const query = await db.get("queries", key) as CachedQuery | undefined;
    if (!query || query.eventIds.length === 0) return null;

    let latest = 0;
    for (const id of query.eventIds) {
      const cached = await db.get("events", id) as CachedEvent | undefined;
      if (cached?.event?.created_at && cached.event.created_at > latest) {
        latest = cached.event.created_at;
      }
    }
    return latest > 0 ? latest : null;
  } catch {
    return null;
  }
}

export async function clearCache(): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(["events", "queries"], "readwrite");
    await tx.objectStore("events").clear();
    await tx.objectStore("queries").clear();
    await tx.done;
  } catch {
    // ignore
  }
}

/**
 * Stale-while-revalidate fetch wrapper.
 * Returns cached data immediately if available, then refreshes in background.
 */
export async function cachedFetch<T>(
  filter: Record<string, unknown>,
  ttl: number,
  fetchFn: () => Promise<{ events: Event[]; parsed: T[] }>,
  parser: (events: Event[]) => T[],
  onUpdate?: (data: T[]) => void,
): Promise<T[]> {
  // Try cache first
  const cached = await getCached(filter, parser);

  if (cached && !cached.stale) {
    return cached.data;
  }

  if (cached && cached.stale) {
    // Return stale data, refresh in background
    fetchFn().then(({ events, parsed }) => {
      putCache(filter, events, ttl);
      onUpdate?.(parsed);
    }).catch(() => {});
    return cached.data;
  }

  // No cache — fetch fresh
  const { events, parsed } = await fetchFn();
  putCache(filter, events, ttl);
  return parsed;
}
