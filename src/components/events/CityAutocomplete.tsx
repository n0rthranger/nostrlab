"use client";

import { useEffect, useRef, useState } from "react";

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    region?: string;
    country?: string;
    country_code?: string;
    amenity?: string;
    building?: string;
    shop?: string;
  };
}

interface Suggestion {
  id: number;
  primary: string;   // "233 E Erie St" or "Chicago" or "Lincoln Park Pavilion"
  street: string | null; // street + number if available, for venue prefill
  city: string;       // best-guess city/town/village
  state: string | null;
  country: string | null;
  secondary: string;  // "Chicago, Illinois, United States" — what shows under primary
  isPrecise: boolean; // street/address-level (true) vs city-level (false)
  lat: number;
  lng: number;
}

function formatSuggestion(r: NominatimResult): Suggestion {
  const a = r.address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? "";
  const state = a.state ?? a.region ?? null;
  const country = a.country ?? null;

  // Street-level: build "house_number + road" or "road"
  const street = a.road
    ? (a.house_number ? `${a.house_number} ${a.road}` : a.road)
    : null;
  // Place-level: amenity, building, shop names get priority for the headline
  const placeName = a.amenity ?? a.building ?? a.shop ?? null;

  // Headline: most specific available
  let primary: string;
  let isPrecise = false;
  if (placeName) {
    primary = placeName;
    isPrecise = true;
  } else if (street) {
    primary = street;
    isPrecise = true;
  } else if (city) {
    primary = city;
  } else {
    primary = r.display_name.split(",")[0]?.trim() ?? "";
  }

  // Secondary line: city + state + country, omitting parts already in primary
  const secondaryParts: string[] = [];
  if (city && city !== primary) secondaryParts.push(city);
  if (state) secondaryParts.push(state);
  if (country) secondaryParts.push(country);

  return {
    id: r.place_id,
    primary,
    street,
    city,
    state,
    country,
    secondary: secondaryParts.join(", "),
    isPrecise,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
  };
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  onPick?: (picked: {
    city: string;
    state: string | null;
    country: string | null;
    street: string | null;
    isPrecise: boolean;
    lat: number;
    lng: number;
  }) => void;
  onSuggestedCenter?: (center: { lat: number; lng: number } | null) => void;
}

export function CityAutocomplete({ value, onChange, onPick, onSuggestedCenter }: Props) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Debounced fetch from Nominatim (OpenStreetMap geocoder).
  // Public service — please be polite: 1 query/sec, no flood, no commercial.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!value || value.length < 2) {
      setItems([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        setLoading(true);
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", value);
        url.searchParams.set("format", "json");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "8");
        const res = await fetch(url.toString(), {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error("geocode failed");
        const json: NominatimResult[] = await res.json();
        setItems(json.map(formatSuggestion));
        setOpen(true);
        setActive(0);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(s: Suggestion) {
    // City field always shows the city name (not the full address). The
    // form decides what to do with street/venue info via onPick.
    onChange(s.city || s.primary);
    onPick?.({
      city: s.city,
      state: s.state,
      country: s.country,
      street: s.street,
      isPrecise: s.isPrecise,
      lat: s.lat,
      lng: s.lng,
    });
    onSuggestedCenter?.({ lat: s.lat, lng: s.lng });
    setOpen(false);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (items.length > 0) setOpen(true); }}
        onKeyDown={(e) => {
          if (!open || items.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); const s = items[active]; if (s) pick(s); }
          else if (e.key === "Escape") { setOpen(false); }
        }}
        placeholder="Chicago"
        autoComplete="off"
        spellCheck={false}
      />
      {open && items.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-border bg-surface shadow-lg overflow-hidden max-h-[360px] overflow-y-auto">
          {items.map((s, i) => (
            <button
              type="button"
              key={s.id}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(s)}
              className={
                "w-full text-left px-3.5 py-2.5 flex items-start gap-3 transition-colors " +
                (i === active ? "bg-surface2" : "hover:bg-surface2")
              }
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={(s.isPrecise ? "text-violet-600" : "text-muted") + " mt-0.5 shrink-0"}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{s.primary}</div>
                {s.secondary && <div className="text-xs text-muted truncate">{s.secondary}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
      {loading && value.length >= 2 && items.length === 0 && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">Searching…</div>
      )}
    </div>
  );
}
