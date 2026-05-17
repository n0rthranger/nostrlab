"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MlMap, type Marker as MlMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { encodeGeohash } from "@/lib/geohash";

const TILE_STYLE = "https://tiles.openfreemap.org/styles/positron";

interface Props {
  // Initial pin position (if editing or city was prefilled)
  initialLat?: number | null;
  initialLng?: number | null;
  // Suggested center: flies the map there when it changes. If `precise` is
  // true, also drops a pin at that exact location (street-level picks). City
  // picks (precise=false) only fly the camera and clear any prior pin.
  suggestedCenter?: { lat: number; lng: number; precise?: boolean } | null;
  onChange: (next: { lat: number; lng: number; geohash: string } | null) => void;
}

function makeMarker(map: MlMap, lng: number, lat: number): MlMarker {
  return new maplibregl.Marker({ color: "#7c3aed", anchor: "bottom" })
    .setLngLat([lng, lat])
    .addTo(map);
}

export default function LocationPickerImpl({ initialLat, initialLng, suggestedCenter, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRef = useRef<MlMarker | null>(null);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null
  );

  // Initialize the map once
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const start = coords ?? suggestedCenter ?? { lat: 25, lng: 10 };
    const map = new maplibregl.Map({
      container,
      style: TILE_STYLE,
      center: [start.lng, start.lat],
      zoom: coords || suggestedCenter ? 12 : 1.4,
      attributionControl: false,
      cooperativeGestures: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();

    map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);

    map.on("load", () => {
      requestAnimationFrame(() => map.resize());
      if (coords) {
        markerRef.current = makeMarker(map, coords.lng, coords.lat);
      }
    });

    map.on("click", (e) => {
      const lat = e.lngLat.lat;
      const lng = e.lngLat.lng;
      placePin(lat, lng);
    });

    mapRef.current = map;
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // We intentionally exclude `coords`/`suggestedCenter` so the map only
    // initializes once. Subsequent updates flow via setLngLat / flyTo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to suggestedCenter changes (autocomplete pick).
  // - precise=true (street/address): drop a pin at that point and zoom close.
  // - precise=false/undefined (city-level): clear any prior pin and just fly.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !suggestedCenter) return;
    const { lat, lng, precise } = suggestedCenter;

    if (precise) {
      // Drop pin programmatically — same path the click handler uses
      if (markerRef.current) {
        markerRef.current.setLngLat([lng, lat]);
      } else {
        markerRef.current = makeMarker(map, lng, lat);
      }
      setCoords({ lat, lng });
      onChange({ lat, lng, geohash: encodeGeohash(lat, lng, 9) });
      map.flyTo({ center: [lng, lat], zoom: 16, speed: 1.2, curve: 1.45, essential: true });
    } else {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      setCoords(null);
      onChange(null);
      map.flyTo({ center: [lng, lat], zoom: 12, speed: 1.1, curve: 1.45, essential: true });
    }
    // onChange / setCoords intentionally not in deps — fires on suggestedCenter only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedCenter]);

  function placePin(lat: number, lng: number) {
    setCoords({ lat, lng });
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    } else {
      markerRef.current = makeMarker(map, lng, lat);
    }
    onChange({ lat, lng, geohash: encodeGeohash(lat, lng, 9) });
  }

  function clearPin() {
    setCoords(null);
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <div
        className="rounded-2xl overflow-hidden border border-border bg-zinc-50"
        style={{ position: "relative", height: 340, width: "100%" }}
      >
        <div
          ref={containerRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
        {!coords && (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 z-10 inline-flex items-center gap-2 h-8 px-3 rounded-full bg-white/95 backdrop-blur-sm border border-zinc-200 text-xs font-semibold text-zinc-700 shadow-sm pointer-events-none">
            Click on the map to drop a pin
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 text-xs">
        {coords ? (
          <>
            <span className="font-mono text-muted">
              {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              <span className="ml-2 text-violet-600">
                #{encodeGeohash(coords.lat, coords.lng, 8)}
              </span>
            </span>
            <button
              type="button"
              onClick={clearPin}
              className="text-muted hover:text-fg transition-colors"
            >
              Clear pin
            </button>
          </>
        ) : (
          <span className="text-muted">No pin yet — events without a pin show only at city level on the map.</span>
        )}
      </div>
    </div>
  );
}
