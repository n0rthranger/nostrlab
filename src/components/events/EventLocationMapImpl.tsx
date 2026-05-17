"use client";

import { useEffect, useRef } from "react";
import maplibregl, { type Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const TILE_STYLE = "https://tiles.openfreemap.org/styles/positron";

interface Props {
  lat: number;
  lng: number;
  // Whether the coordinates are precise (geohash) or approximate (city only).
  // Approximate locations get a wider zoom and softer marker.
  precise?: boolean;
  label?: string;
}

export default function EventLocationMapImpl({ lat, lng, precise, label }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = new maplibregl.Map({
      container,
      style: TILE_STYLE,
      center: [lng, lat],
      zoom: precise ? 14 : 11,
      attributionControl: false,
      cooperativeGestures: true,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }),
      "top-right"
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left"
    );

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);

    map.on("load", () => {
      // Custom HTML pin: orange aura + violet core + label
      const el = document.createElement("div");
      el.className = "event-pin";
      el.innerHTML = `
        <span class="event-pin-halo"></span>
        <span class="event-pin-ring"></span>
        <span class="event-pin-dot"></span>
      `;
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([lng, lat])
        .addTo(map);

      if (label) {
        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 22,
          className: "event-pin-popup",
        }).setText(label);
        marker.setPopup(popup);
        popup.addTo(map);
      }
    });

    mapRef.current = map;

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng, precise, label]);

  return (
    <div className="relative w-full h-full" ref={containerRef} />
  );
}
