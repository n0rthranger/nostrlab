"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import maplibregl, { type Map as MlMap, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "@/lib/utils";
import type { EventListItemDTO } from "@/types";

const TILE_STYLE = "https://tiles.openfreemap.org/styles/positron";

interface CityBucket {
  slug: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  eventCount: number;
  rsvpCount: number;
  sample: EventListItemDTO[];
}

interface SelectedHub {
  slug: string;
  name: string;
  country: string;
  eventCount: number;
  rsvpCount: number;
  sampleTitle?: string;
}

interface HeroMapImplProps {
  variant?: "panel" | "immersive";
}

export default function HeroMapImpl({ variant = "panel" }: HeroMapImplProps) {
  const immersive = variant === "immersive";
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [cities, setCities] = useState<CityBucket[]>([]);
  const [selectedHub, setSelectedHub] = useState<SelectedHub | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; label: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [hintShown, setHintShown] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("nostrlab_map_hint") === "1";
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cities")
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setCities(j.cities ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const active = useMemo(
    () => cities.filter((c) => c.slug !== "__online__" && c.eventCount > 0),
    [cities]
  );
  const inactive = useMemo(
    () => cities.filter((c) => c.slug !== "__online__" && c.eventCount === 0),
    [cities]
  );
  const totalEvents = useMemo(
    () => active.reduce((sum, c) => sum + c.eventCount, 0),
    [active]
  );

  // Initialize the map (only once)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    if (!canUseWebGL()) {
      setMapError(true);
      return;
    }

    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container,
        style: TILE_STYLE,
        center: [10, 25],
        zoom: 1.4,
        attributionControl: false,
        cooperativeGestures: !immersive,
        maxZoom: 14,
        minZoom: 1,
        dragRotate: false,
        pitchWithRotate: false,
        touchZoomRotate: true,
        touchPitch: false,
      });
    } catch {
      setMapError(true);
      return;
    }

    map.on("error", (e) => {
      const message = String(e.error?.message ?? "");
      if (message.toLowerCase().includes("webgl")) setMapError(true);
    });
    map.touchZoomRotate.disableRotation();

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);

    // Mark the cooperative-gesture hint as "seen" the first time it triggers.
    // After that the CSS rule below hides every subsequent overlay.
    const onFirstWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setHintShown(true);
        try { localStorage.setItem("nostrlab_map_hint", "1"); } catch {}
        container.removeEventListener("wheel", onFirstWheel);
      }
    };
    container.addEventListener("wheel", onFirstWheel, { passive: true });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left"
    );

    map.on("load", () => {
      setReady(true);
      simplifyBaseMap(map);

      map.addSource("hubs-inactive", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("hubs-active", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: 6,
        clusterRadius: 44,
      });

      // Inactive open hubs — small gray dots.
      map.addLayer({
        id: "inactive-dots",
        type: "circle",
        source: "hubs-inactive",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 1.8, 6, 3.5],
          "circle-color": "#a1a1aa",
          "circle-opacity": 0.55,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      });

      // ─── Active markers — purple core, orange aura ───
      // Outer halo — orange, blooms outward
      map.addLayer({
        id: "active-halo",
        type: "circle",
        source: "hubs-active",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#f97316",
          "circle-opacity": 0.22,
          "circle-radius": [
            "interpolate", ["linear"], ["get", "rsvp"],
            0, 22,
            50, 32,
          ],
          "circle-blur": 0.6,
        },
      });
      // Mid ring — soft violet, blends halo into core
      map.addLayer({
        id: "active-ring",
        type: "circle",
        source: "hubs-active",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#a78bfa",
          "circle-opacity": 0.4,
          "circle-radius": [
            "interpolate", ["linear"], ["get", "rsvp"],
            0, 12,
            50, 18,
          ],
          "circle-blur": 0.2,
        },
      });
      // Solid dot — deep violet
      map.addLayer({
        id: "active-dot",
        type: "circle",
        source: "hubs-active",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#7c3aed",
          "circle-radius": [
            "interpolate", ["linear"], ["get", "rsvp"],
            0, 6,
            50, 11,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5,
          "circle-opacity": 1,
          "circle-radius-transition": { duration: 220, delay: 0 },
        },
      });

      // ─── Clusters ───
      map.addLayer({
        id: "cluster-halo",
        type: "circle",
        source: "hubs-active",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#f97316",
          "circle-opacity": 0.24,
          "circle-radius": [
            "step", ["get", "point_count"],
            30,
            5, 38,
            15, 46,
          ],
          "circle-blur": 0.5,
        },
      });
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "hubs-active",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#7c3aed",
          "circle-opacity": 1,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
          "circle-radius": [
            "step", ["get", "point_count"],
            18,
            5, 24,
            15, 30,
          ],
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "hubs-active",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 14,
        },
        paint: { "text-color": "#ffffff" },
      });

      const linkLayers = ["clusters", "active-dot"];
      for (const id of linkLayers) {
        map.on("mouseenter", id, () => {
          map.getCanvas().style.cursor = "pointer";
          if (id === "active-dot") {
            map.setPaintProperty("active-dot", "circle-radius", [
              "interpolate", ["linear"], ["get", "rsvp"],
              0, 9,
              50, 14,
            ]);
          }
        });
        map.on("mouseleave", id, () => {
          map.getCanvas().style.cursor = "";
          setHover(null);
          if (id === "active-dot") {
            map.setPaintProperty("active-dot", "circle-radius", [
              "interpolate", ["linear"], ["get", "rsvp"],
              0, 6,
              50, 11,
            ]);
          }
        });
      }

      map.on("click", "clusters", async (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const f = e.features?.[0];
        if (!f || !f.properties || f.geometry.type !== "Point") return;
        const src = map.getSource("hubs-active") as GeoJSONSource;
        const clusterId = f.properties.cluster_id as number;
        try {
          const z = await src.getClusterExpansionZoom(clusterId);
          map.flyTo({
            center: f.geometry.coordinates as [number, number],
            zoom: Math.max(z, map.getZoom() + 1.5),
            speed: 1.1,
            curve: 1.42,
            essential: true,
          });
        } catch {
          // ignore
        }
      });

      map.on("click", "active-dot", (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const f = e.features?.[0];
        if (!f || f.geometry.type !== "Point") return;
        const props = f.properties ?? {};
        const name = props.name as string | undefined;
        if (!name) return;
        setSelectedHub({
          slug: (props.slug as string | undefined) ?? name,
          name,
          country: (props.country as string | undefined) ?? "",
          eventCount: Number(props.events ?? 0),
          rsvpCount: Number(props.rsvp ?? 0),
          sampleTitle: (props.sampleTitle as string | undefined) || undefined,
        });
        map.easeTo({
          center: f.geometry.coordinates as [number, number],
          zoom: Math.max(map.getZoom(), 4.5),
          duration: 550,
          essential: true,
        });
      });

      map.on("mousemove", "active-dot", (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const f = e.features?.[0];
        if (!f) return;
        const name = f.properties?.name as string;
        const events = f.properties?.events as number;
        setHover({
          x: e.point.x,
          y: e.point.y,
          label: `${name} · ${events} ${events === 1 ? "event" : "events"}`,
        });
      });
      map.on("mousemove", "clusters", (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const f = e.features?.[0];
        if (!f) return;
        const points = f.properties?.point_count as number;
        setHover({ x: e.point.x, y: e.point.y, label: `${points} cities · click to expand` });
      });
    });

    mapRef.current = map;

    return () => {
      ro.disconnect();
      container.removeEventListener("wheel", onFirstWheel);
      map.remove();
      mapRef.current = null;
    };
  }, [immersive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateSources = () => {
      const activeSrc = map.getSource("hubs-active") as GeoJSONSource | undefined;
      const inactiveSrc = map.getSource("hubs-inactive") as GeoJSONSource | undefined;
      if (!activeSrc || !inactiveSrc) return;
      activeSrc.setData({
        type: "FeatureCollection",
        features: active.map((c) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [c.lng, c.lat] },
          properties: {
            slug: c.slug,
            name: c.name,
            country: c.country,
            events: c.eventCount,
            rsvp: c.rsvpCount,
            sampleTitle: c.sample[0]?.title ?? "",
          },
        })),
      });
      inactiveSrc.setData({
        type: "FeatureCollection",
        features: inactive.map((c) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [c.lng, c.lat] },
          properties: { name: c.name },
        })),
      });
    };

    if (map.isStyleLoaded() && map.getSource("hubs-active")) {
      updateSources();
    } else {
      map.once("load", updateSources);
    }
  }, [active, inactive]);

  function zoomBy(delta: number) {
    const m = mapRef.current;
    if (!m) return;
    m.easeTo({ zoom: m.getZoom() + delta, duration: 350 });
  }
  function reset() {
    const m = mapRef.current;
    if (!m) return;
    m.flyTo({ center: [10, 25], zoom: 1.4, speed: 0.9, curve: 1.45, essential: true });
    setSelectedHub(null);
  }
  function focusCity(city: CityBucket) {
    const m = mapRef.current;
    setSelectedHub({
      slug: city.slug,
      name: city.name,
      country: city.country,
      eventCount: city.eventCount,
      rsvpCount: city.rsvpCount,
      sampleTitle: city.sample[0]?.title,
    });
    if (!m) return;
    m.flyTo({
      center: [city.lng, city.lat],
      zoom: Math.max(m.getZoom(), 4.5),
      speed: 0.9,
      curve: 1.35,
      essential: true,
    });
  }

  if (mapError) {
    return <HeroMapFallback cities={active} totalEvents={totalEvents} variant={variant} />;
  }

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden",
        immersive ? "min-h-[380px] bg-zinc-950 md:min-h-[460px] lg:min-h-[640px]" : "min-h-[320px] bg-zinc-50 md:min-h-[460px]",
        hintShown && "[&_.maplibregl-cooperative-gesture-screen]:hidden"
      )}
    >
      <div
        ref={containerRef}
        className={cn(
          "absolute inset-0",
          ready ? "opacity-100" : "opacity-0"
        )}
        style={{ width: "100%", height: "100%" }}
      />

      {/* Subtle vignette so the map blends into the page */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: immersive
            ? "radial-gradient(70% 60% at 65% 45%, rgba(255,255,255,0) 42%, rgba(9,9,11,0.18) 72%, rgba(9,9,11,0.42) 100%)"
            : "radial-gradient(120% 80% at 50% 100%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.65) 100%)",
        }}
      />

      {hover && (
        <div
          className="absolute z-20 pointer-events-none px-2.5 py-1.5 rounded-lg bg-zinc-950 text-white text-xs font-semibold shadow-xl whitespace-nowrap"
          style={{
            left: hover.x,
            top: hover.y - 14,
            transform: "translate(-50%, -100%)",
          }}
        >
          {hover.label}
          <div
            className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0"
            style={{
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "5px solid rgb(9 9 11)",
            }}
          />
        </div>
      )}

      {/* Top-left status pill */}
      <div className={cn(
        "absolute z-10 inline-flex h-9 items-center gap-2 rounded-full pl-3 pr-3.5 text-xs font-semibold backdrop-blur-md",
        immersive
          ? "left-5 top-5 border border-white/15 bg-zinc-950/70 text-white shadow-2xl sm:left-auto sm:right-16"
          : "left-4 top-4 border border-zinc-200 bg-white/95 text-zinc-700 shadow-md"
      )}>
        <span className="h-2 w-2 rounded-full bg-orange-500" />
        Live · {active.length} {active.length === 1 ? "city" : "cities"} · {totalEvents} events
      </div>

      {/* Top-right zoom + reset */}
      <div className={cn(
        "absolute z-10 flex flex-col overflow-hidden rounded-2xl backdrop-blur-md",
        immersive
          ? "right-5 top-5 border border-white/15 bg-zinc-950/70 shadow-2xl"
          : "right-4 top-4 border border-zinc-200 bg-white/95 shadow-md"
      )}>
        <button
          onClick={() => zoomBy(1)}
          aria-label="Zoom in"
          className={cn(
            "grid h-9 w-9 place-items-center transition-colors",
            immersive ? "text-white hover:bg-white/10" : "text-zinc-700 hover:bg-zinc-100"
          )}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <div className={immersive ? "h-px bg-white/15" : "h-px bg-zinc-200"} />
        <button
          onClick={() => zoomBy(-1)}
          aria-label="Zoom out"
          className={cn(
            "grid h-9 w-9 place-items-center transition-colors",
            immersive ? "text-white hover:bg-white/10" : "text-zinc-700 hover:bg-zinc-100"
          )}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M5 12h14" />
          </svg>
        </button>
        <div className={immersive ? "h-px bg-white/15" : "h-px bg-zinc-200"} />
        <button
          onClick={reset}
          aria-label="Reset view"
          className={cn(
            "grid h-9 w-9 place-items-center transition-colors",
            immersive ? "text-white hover:bg-white/10" : "text-zinc-700 hover:bg-zinc-100"
          )}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 15.5-6.3M21 12A9 9 0 0 1 5.5 18.3M21 4v5h-5M3 20v-5h5" />
          </svg>
        </button>
      </div>

      {selectedHub && (
        <div
          className={cn(
            "absolute z-20 rounded-2xl border p-4 shadow-2xl backdrop-blur-xl",
            immersive
              ? "bottom-20 left-5 right-5 border-white/25 bg-zinc-950/95 text-white ring-1 ring-black/35 sm:left-auto sm:w-[360px]"
              : "bottom-16 left-4 right-4 border-zinc-200 bg-white/95 text-zinc-950 sm:left-auto sm:w-[340px]"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={cn(
                "font-mono text-[11px] font-semibold uppercase tracking-[0.16em]",
                immersive ? "text-orange-200" : "text-orange-600"
              )}>
                {selectedHub.country || "Local hub"}
              </div>
              <div className="mt-1 text-lg font-semibold leading-tight">
                {selectedHub.name}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close city preview"
              onClick={() => setSelectedHub(null)}
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold transition",
                immersive ? "bg-white/14 text-white hover:bg-white/24" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              )}
            >
              x
            </button>
          </div>
          <div className={cn("mt-3 grid grid-cols-2 gap-2 text-sm", immersive ? "text-zinc-100" : "text-zinc-600")}>
            <div className={cn("rounded-xl px-3 py-2", immersive ? "border border-white/12 bg-white/16" : "bg-zinc-100")}>
              <div className="text-lg font-semibold text-current">{selectedHub.eventCount}</div>
              <div>events</div>
            </div>
            <div className={cn("rounded-xl px-3 py-2", immersive ? "border border-white/12 bg-white/16" : "bg-zinc-100")}>
              <div className="text-lg font-semibold text-current">{selectedHub.rsvpCount}</div>
              <div>RSVPs</div>
            </div>
          </div>
          {selectedHub.sampleTitle && (
            <div className={cn("mt-3 text-sm leading-snug", immersive ? "text-zinc-100" : "text-zinc-600")}>
              Next: <span className="font-semibold text-current">{selectedHub.sampleTitle}</span>
            </div>
          )}
          <Link
            href={`/events?city=${encodeURIComponent(selectedHub.name)}&limit=200`}
            className={cn(
              "mt-4 inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold transition active:scale-[0.98]",
              immersive ? "bg-white text-zinc-950 hover:bg-orange-200" : "bg-zinc-950 text-white hover:bg-orange-500"
            )}
          >
            View events
          </Link>
        </div>
      )}

    </div>
  );
}

function canUseWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

function simplifyBaseMap(map: MlMap) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type === "line") {
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
    if (layer.type === "fill") {
      map.setPaintProperty(layer.id, "fill-opacity", 0.72);
    }
  }
}

function HeroMapFallback({
  cities,
  totalEvents,
  variant = "panel",
}: {
  cities: CityBucket[];
  totalEvents: number;
  variant?: "panel" | "immersive";
}) {
  const immersive = variant === "immersive";
  const featured = cities.slice(0, 5);
  return (
    <div className={cn(
      "relative h-full w-full overflow-hidden",
      immersive ? "min-h-[380px] bg-zinc-950 md:min-h-[460px] lg:min-h-[640px]" : "min-h-[320px] bg-zinc-100 md:min-h-[460px]"
    )}>
      <div
        className="absolute inset-0"
        style={{
          background: immersive
            ? "radial-gradient(circle at 70% 34%, rgba(124,58,237,0.34), transparent 28%), radial-gradient(circle at 40% 58%, rgba(249,115,22,0.26), transparent 30%), linear-gradient(90deg, rgba(9,9,11,0.96), rgba(9,9,11,0.25))"
            : "radial-gradient(circle at 68% 34%, rgba(124,58,237,0.18), transparent 28%), radial-gradient(circle at 35% 58%, rgba(249,115,22,0.16), transparent 30%)",
        }}
      />

      {featured.map((city, index) => (
        <Link
          key={city.slug}
          href={`/events?city=${encodeURIComponent(city.name)}&limit=200`}
          className="absolute z-10 group"
          style={{
            left: `${22 + ((index * 17) % 58)}%`,
            top: `${28 + ((index * 13) % 46)}%`,
          }}
        >
          <span className="sr-only">View events in {city.name}</span>
          <span className="absolute -inset-4 rounded-full bg-orange-500/20 blur-md transition group-hover:bg-orange-500/35" />
          <span className="relative flex h-4 w-4 rounded-full bg-violet-600 ring-4 ring-white shadow-lg" />
        </Link>
      ))}

      <div className={cn(
        "absolute left-4 top-4 z-10 inline-flex h-9 items-center gap-2 rounded-full pl-3 pr-3.5 text-xs font-semibold backdrop-blur-md",
        immersive
          ? "border border-white/15 bg-zinc-950/70 text-white shadow-2xl"
          : "border border-zinc-200 bg-white/95 text-zinc-700 shadow-md"
      )}>
        <span className="h-2 w-2 rounded-full bg-orange-500" />
        Live · {cities.length} {cities.length === 1 ? "city" : "cities"} · {totalEvents} events
      </div>
    </div>
  );
}
