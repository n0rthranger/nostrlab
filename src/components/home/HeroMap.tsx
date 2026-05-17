"use client";

import dynamic from "next/dynamic";

// MapLibre uses browser-only APIs (Canvas, Worker, navigator). We dynamic-import
// the implementation with SSR disabled so it never tries to evaluate on the
// server, and so the bundle stays out of the initial server payload.
const HeroMapImpl = dynamic(() => import("./HeroMapImpl"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-transparent">
      <div className="text-xs font-mono uppercase tracking-[0.25em] text-zinc-400">
        Loading map…
      </div>
    </div>
  ),
});

export function HeroMap({ variant = "panel" }: { variant?: "panel" | "immersive" }) {
  return <HeroMapImpl variant={variant} />;
}
