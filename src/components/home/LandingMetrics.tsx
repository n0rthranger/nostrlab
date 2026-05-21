"use client";

import { useEffect, useMemo, useState } from "react";

type Metrics = {
  totalUpcoming: number;
  totalCommunities: number;
  totalRsvps: number;
};

const REFRESH_INTERVAL_MS = 30_000;

export function LandingMetrics({ totalUpcoming, totalCommunities, totalRsvps }: Metrics) {
  const initialMetrics = useMemo(
    () => ({ totalUpcoming, totalCommunities, totalRsvps }),
    [totalUpcoming, totalCommunities, totalRsvps],
  );
  const [metrics, setMetrics] = useState(initialMetrics);

  useEffect(() => {
    setMetrics(initialMetrics);
  }, [initialMetrics]);

  useEffect(() => {
    let cancelled = false;

    async function refreshMetrics() {
      try {
        const res = await fetch("/api/landing-metrics", { cache: "no-store" });
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (!cancelled && isMetrics(data)) {
          setMetrics(data);
        }
      } catch {
        // Keep the last known numbers if the background refresh fails.
      }
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshMetrics();
      }
    };

    const interval = window.setInterval(refreshMetrics, REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return (
    <section className="border-y border-white/10 bg-zinc-950">
      <div className="mx-auto grid max-w-[1500px] grid-cols-2 gap-px bg-white/10 md:grid-cols-4">
        <Metric label="Upcoming" value={metrics.totalUpcoming} />
        <Metric label="Communities" value={metrics.totalCommunities} />
        <Metric label="RSVPs" value={metrics.totalRsvps} />
        <Metric label="NostrLab fee" value={0} suffix="%" accent />
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: number;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-zinc-950 px-6 py-8 md:px-10">
      <div className={accent ? "cinematic-number text-5xl font-semibold leading-none text-orange-400" : "cinematic-number text-5xl font-semibold leading-none text-white"}>
        {value.toLocaleString()}
        {suffix && <span className="text-2xl">{suffix}</span>}
      </div>
      <div className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</div>
    </div>
  );
}

function isMetrics(value: unknown): value is Metrics {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.totalUpcoming === "number" &&
    typeof candidate.totalCommunities === "number" &&
    typeof candidate.totalRsvps === "number"
  );
}
