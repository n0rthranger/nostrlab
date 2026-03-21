import { useState, useEffect, useCallback, useRef } from "react";

export interface RelayStatus {
  url: string;
  status: "online" | "offline" | "checking";
  latencyMs: number | null;
  lastChecked: number;
}

async function checkRelay(url: string): Promise<RelayStatus> {
  const start = Date.now();
  return new Promise<RelayStatus>((resolve) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      resolve({ url, status: "offline", latencyMs: null, lastChecked: Date.now() });
      return;
    }

    let resolved = false;

    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      try { ws.close(); } catch { /* ignore */ }
      resolve({ url, status: "offline", latencyMs: null, lastChecked: Date.now() });
    }, 5000);

    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      try { ws.close(); } catch { /* ignore */ }
    };

    ws.onopen = () => {
      if (resolved) return;
      // Send a trivial REQ to measure round-trip
      const subId = "ping_" + Math.random().toString(36).slice(2, 8);
      ws.send(JSON.stringify(["REQ", subId, { limit: 1, kinds: [0], authors: ["0000000000000000000000000000000000000000000000000000000000000000"] }]));

      const onMessage = (e: MessageEvent) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg[0] === "EOSE" && msg[1] === subId) {
            ws.removeEventListener("message", onMessage);
            cleanup();
            resolve({
              url,
              status: "online",
              latencyMs: Date.now() - start,
              lastChecked: Date.now(),
            });
          }
        } catch { cleanup(); }
      };
      ws.addEventListener("message", onMessage);
    };

    ws.onerror = () => {
      cleanup();
      resolve({ url, status: "offline", latencyMs: null, lastChecked: Date.now() });
    };
  });
}

export function useRelayStatus(relays: string[], intervalMs = 30000) {
  const [statuses, setStatuses] = useState<Map<string, RelayStatus>>(new Map());
  const [checking, setChecking] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const checkAll = useCallback(async () => {
    if (relays.length === 0) return;
    setChecking(true);

    // Set all to "checking"
    setStatuses((prev) => {
      const next = new Map(prev);
      for (const url of relays) {
        const existing = next.get(url);
        next.set(url, { url, status: "checking", latencyMs: existing?.latencyMs ?? null, lastChecked: existing?.lastChecked ?? 0 });
      }
      return next;
    });

    const results = await Promise.all(relays.map(checkRelay));
    const map = new Map<string, RelayStatus>();
    for (const r of results) {
      map.set(r.url, r);
    }
    setStatuses(map);
    setChecking(false);
  }, [relays]);

  useEffect(() => {
    queueMicrotask(checkAll);
    intervalRef.current = setInterval(checkAll, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkAll, intervalMs]);

  const onlineCount = [...statuses.values()].filter((s) => s.status === "online").length;
  const totalCount = relays.length;

  return { statuses, onlineCount, totalCount, checking, checkAll };
}
