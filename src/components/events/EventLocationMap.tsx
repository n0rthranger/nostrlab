"use client";

import dynamic from "next/dynamic";

const EventLocationMapImpl = dynamic(() => import("./EventLocationMapImpl"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-zinc-50 text-xs font-mono uppercase tracking-[0.25em] text-zinc-400">
      Loading map…
    </div>
  ),
});

interface Props {
  lat: number;
  lng: number;
  precise?: boolean;
  label?: string;
}

export function EventLocationMap(props: Props) {
  return <EventLocationMapImpl {...props} />;
}
