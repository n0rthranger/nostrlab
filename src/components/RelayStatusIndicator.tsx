import { useState, useRef, useEffect } from "react";
import { useRelays } from "../hooks/useRelays";
import { useRelayStatus } from "../hooks/useRelayStatus";

export default function RelayStatusIndicator() {
  const { globalRelays } = useRelays();
  const { statuses, onlineCount, totalCount, checking, checkAll } = useRelayStatus(globalRelays);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const dotColor =
    totalCount === 0 ? "bg-text-muted" :
    onlineCount === totalCount ? "bg-green" :
    onlineCount > 0 ? "bg-orange" :
    "bg-red";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary bg-transparent border-0 cursor-pointer"
      >
        <span className={`w-2 h-2 rounded-full ${dotColor} ${checking ? "animate-pulse" : ""}`} />
        <span>{onlineCount}/{totalCount} relays</span>
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-80 bg-bg-secondary border border-border rounded-lg shadow-lg z-50 animate-fadeIn">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-text-primary">Relay Status</span>
            <button
              onClick={checkAll}
              disabled={checking}
              className="text-[10px] px-2 py-0.5 bg-bg-tertiary border border-border rounded text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-50"
            >
              {checking ? "Checking..." : "Refresh"}
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {globalRelays.map((url) => {
              const s = statuses.get(url);
              const statusDot =
                !s || s.status === "checking" ? "bg-text-muted animate-pulse" :
                s.status === "online" ? "bg-green" :
                "bg-red";
              return (
                <div key={url} className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-border/50 last:border-0">
                  <span className={`w-1.5 h-1.5 rounded-full ${statusDot} shrink-0`} />
                  <span className="font-mono text-text-secondary truncate flex-1">
                    {url.replace("wss://", "")}
                  </span>
                  {s?.status === "online" && s.latencyMs !== null && (
                    <span className={`shrink-0 ${s.latencyMs < 500 ? "text-green" : s.latencyMs < 1500 ? "text-orange" : "text-red"}`}>
                      {s.latencyMs}ms
                    </span>
                  )}
                  {s?.status === "offline" && (
                    <span className="text-red shrink-0">offline</span>
                  )}
                  {(!s || s.status === "checking") && (
                    <span className="text-text-muted shrink-0">...</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
