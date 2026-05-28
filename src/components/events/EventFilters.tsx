"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const QUICK_TAGS = ["bitcoin", "nostr", "lightning", "workshop", "online"];
const PRICE_OPTS = [
  { v: "", label: "Any" },
  { v: "free", label: "Free" },
  { v: "paid", label: "Paid" },
];
const MODE_OPTS = [
  { v: "", label: "Any" },
  { v: "offline", label: "In-person" },
  { v: "online", label: "Online" },
  { v: "hybrid", label: "Hybrid" },
];
const STATUS_OPTS = [
  { v: "", label: "Active" },
  { v: "all", label: "All" },
  { v: "cancelled", label: "Cancelled" },
];

export function EventFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [city, setCity] = useState(sp.get("city") ?? "");
  const [locating, setLocating] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const tag = sp.get("tag") ?? "";
  const mode = sp.get("mode") ?? "";
  const paid = sp.get("paid") ?? "";
  const status = sp.get("status") ?? "";

  const updateParam = useCallback((key: string, val: string) => {
    const p = new URLSearchParams(sp.toString());
    if (val) p.set(key, val); else p.delete(key);
    router.push(`/events?${p.toString()}`);
  }, [router, sp]);

  const useNearMe = useCallback(() => {
    setGeoErr(null);
    if (!navigator.geolocation) {
      setGeoErr("Location is not available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = new URLSearchParams(sp.toString());
        p.set("lat", pos.coords.latitude.toFixed(5));
        p.set("lng", pos.coords.longitude.toFixed(5));
        p.set("radius", "50");
        p.delete("city");
        router.push(`/events?${p.toString()}`);
        setCity("");
        setLocating(false);
      },
      (err) => {
        setGeoErr(err.message || "Location permission failed.");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 }
    );
  }, [router, sp]);

  // Debounced search/city
  useEffect(() => {
    const id = setTimeout(() => {
      const p = new URLSearchParams(sp.toString());
      if (q) p.set("q", q); else p.delete("q");
      if (city) p.set("city", city); else p.delete("city");
      const next = `/events?${p.toString()}`;
      if (`/events?${sp.toString()}` !== next) router.push(next);
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, city]);

  const hasFilters = !!(sp.get("q") || sp.get("city") || sp.get("tag") || sp.get("category") || sp.get("mode") || sp.get("paid") || sp.get("status") || sp.get("view") || sp.get("lat") || sp.get("lng"));
  const subscribeHref = `/api/calendar/events.ics${sp.toString() ? `?${sp.toString()}` : ""}`;

  return (
    <div className="space-y-3">
      {/* Search row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1 relative">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search events…"
            className="!pl-9 !rounded-full"
          />
        </div>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City"
          className="!w-full !rounded-full sm:!w-40"
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
          <button
            type="button"
            onClick={useNearMe}
            disabled={locating}
            className="h-10 px-3 text-sm font-medium rounded-full border border-border hover:bg-surface2 disabled:opacity-50 transition-colors"
          >
            {locating ? "Locating..." : "Near me"}
          </button>
          {hasFilters && (
            <button
              onClick={() => router.push("/events")}
              className="h-10 px-3 text-sm text-muted hover:text-fg rounded-full hover:bg-surface2 transition-colors"
            >
              Clear
            </button>
          )}
          <a
            href={subscribeHref}
            className="h-10 px-3 text-sm font-medium rounded-full border border-border hover:bg-surface2 transition-colors text-center leading-[38px]"
          >
            Subscribe
          </a>
        </div>
      </div>
      {geoErr && <div className="text-xs text-danger">{geoErr}</div>}

      {/* Pill rail */}
      <div className="flex flex-wrap items-center gap-2">
        <PillGroup
          label="Price"
          options={PRICE_OPTS}
          value={paid}
          onChange={(v) => updateParam("paid", v)}
        />
        <span className="hidden md:inline-block w-px h-5 bg-border mx-1" />
        <PillGroup
          label="Format"
          options={MODE_OPTS}
          value={mode}
          onChange={(v) => updateParam("mode", v)}
        />
        <span className="hidden md:inline-block w-px h-5 bg-border mx-1" />
        <PillGroup
          label="Status"
          options={STATUS_OPTS}
          value={status}
          onChange={(v) => updateParam("status", v)}
        />
        <span className="hidden md:inline-block w-px h-5 bg-border mx-1" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-muted mr-1">Tags</span>
          {QUICK_TAGS.map((t) => (
            <button
              key={t}
              onClick={() => updateParam("tag", tag === t ? "" : t)}
              className={cn(
                "h-7 px-2.5 rounded-full text-xs font-medium border transition-colors",
                tag === t
                  ? "bg-fg text-bg border-fg"
                  : "border-border text-muted hover:text-fg hover:border-subtle"
              )}
            >
              #{t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PillGroup({
  label, options, value, onChange,
}: {
  label: string;
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border bg-surface2 p-1 [scrollbar-width:none] sm:w-auto">
      <span className="shrink-0 text-[11px] text-muted ml-2 mr-1">{label}</span>
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "h-7 shrink-0 px-3 text-xs font-medium rounded-full transition-colors",
            value === o.v ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
