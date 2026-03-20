import { useState, useEffect, useRef, useCallback } from "react";
import { pool } from "../lib/nostr";
import type { Event, Filter } from "nostr-tools";

interface UseSubscriptionOptions {
  enabled?: boolean;
}

interface UseSubscriptionResult<T> {
  events: T[];
  eose: boolean;
  newCount: number;
  flush: () => void;
}

/**
 * Real-time Nostr subscription hook.
 * Opens a persistent subscription and accumulates new events.
 * Call flush() to merge new events into the main list.
 */
export function useSubscription<T>(
  relays: string[],
  filters: Filter[],
  parser: (event: Event) => T | null,
  options: UseSubscriptionOptions = {},
): UseSubscriptionResult<T> {
  const { enabled = true } = options;
  const [events, setEvents] = useState<T[]>([]);
  const [eose, setEose] = useState(false);
  const [pending, setPending] = useState<T[]>([]);
  const seenIds = useRef(new Set<string>());

  const flush = useCallback(() => {
    setPending((currentPending) => {
      if (currentPending.length > 0) {
        setEvents((prev) => [...currentPending, ...prev]);
      }
      return [];
    });
  }, []);

  useEffect(() => {
    if (!enabled || relays.length === 0 || filters.length === 0) return;

    seenIds.current.clear();
    setEvents([]);
    setPending([]);
    setEose(false);

    const sub = pool.subscribeMany(relays, filters, {
      onevent(event: Event) {
        if (seenIds.current.has(event.id)) return;
        seenIds.current.add(event.id);
        const parsed = parser(event);
        if (parsed) {
          setPending((prev) => [parsed, ...prev]);
        }
      },
      oneose() {
        setEose(true);
      },
    });

    return () => {
      sub.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, JSON.stringify(relays), JSON.stringify(filters)]);

  return { events, eose, newCount: pending.length, flush };
}

/**
 * Simpler subscription that auto-merges events (no pending buffer).
 */
export function useLiveEvents<T>(
  relays: string[],
  filters: Filter[],
  parser: (event: Event) => T | null,
  options: UseSubscriptionOptions = {},
): { events: T[]; eose: boolean } {
  const { enabled = true } = options;
  const [events, setEvents] = useState<T[]>([]);
  const [eose, setEose] = useState(false);
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || relays.length === 0 || filters.length === 0) return;

    seenIds.current.clear();
    setEvents([]);
    setEose(false);

    const sub = pool.subscribeMany(relays, filters, {
      onevent(event: Event) {
        if (seenIds.current.has(event.id)) return;
        seenIds.current.add(event.id);
        const parsed = parser(event);
        if (parsed) {
          setEvents((prev) => [parsed, ...prev]);
        }
      },
      oneose() {
        setEose(true);
      },
    });

    return () => {
      sub.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, JSON.stringify(relays), JSON.stringify(filters)]);

  return { events, eose };
}
