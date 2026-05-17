"use client";

import dynamic from "next/dynamic";

const LocationPickerImpl = dynamic(() => import("./LocationPickerImpl"), {
  ssr: false,
  loading: () => (
    <div className="space-y-2">
      <div className="relative h-[340px] rounded-2xl border border-border bg-zinc-50 grid place-items-center">
        <span className="text-xs font-mono uppercase tracking-[0.25em] text-zinc-400">Loading map…</span>
      </div>
    </div>
  ),
});

interface Props {
  initialLat?: number | null;
  initialLng?: number | null;
  // When this changes, the map flies there. If `precise` is true, a pin is
  // also dropped at the location automatically (e.g. user picked a street
  // address from the autocomplete). City-level picks just fly the camera.
  suggestedCenter?: { lat: number; lng: number; precise?: boolean } | null;
  onChange: (next: { lat: number; lng: number; geohash: string } | null) => void;
}

export function LocationPicker(props: Props) {
  return <LocationPickerImpl {...props} />;
}
