import type { SavedEventSearch } from "@prisma/client";

export type SavedSearchInput = {
  name?: string;
  q?: string;
  city?: string;
  tag?: string;
  category?: string;
  mode?: string;
  paid?: string;
  lat?: number;
  lng?: number;
  radius?: number;
};

function clean(value: string | undefined): string | null {
  const next = value?.trim();
  return next ? next : null;
}

export function defaultSavedSearchName(input: SavedSearchInput): string {
  if (clean(input.name)) return clean(input.name)!;
  if (clean(input.q)) return `Search: ${clean(input.q)}`;
  if (clean(input.city)) return `Events in ${clean(input.city)}`;
  if (clean(input.tag)) return `#${clean(input.tag)}`;
  if (clean(input.category)) return `${clean(input.category)} events`;
  if (input.lat !== undefined && input.lng !== undefined) return "Events near me";
  return "All upcoming events";
}

export function savedSearchData(pubkey: string, input: SavedSearchInput) {
  return {
    pubkey,
    name: defaultSavedSearchName(input),
    query: clean(input.q),
    city: clean(input.city),
    tag: clean(input.tag)?.toLowerCase() ?? null,
    category: clean(input.category),
    mode: clean(input.mode),
    paid: clean(input.paid),
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    radiusKm: input.radius ?? null,
  };
}

export function savedSearchHref(search: Pick<
  SavedEventSearch,
  "query" | "city" | "tag" | "category" | "mode" | "paid" | "lat" | "lng" | "radiusKm"
>): string {
  const params = new URLSearchParams();
  if (search.query) params.set("q", search.query);
  if (search.city) params.set("city", search.city);
  if (search.tag) params.set("tag", search.tag);
  if (search.category) params.set("category", search.category);
  if (search.mode) params.set("mode", search.mode);
  if (search.paid) params.set("paid", search.paid);
  if (search.lat !== null && search.lat !== undefined) params.set("lat", String(search.lat));
  if (search.lng !== null && search.lng !== undefined) params.set("lng", String(search.lng));
  if (search.radiusKm) params.set("radius", String(search.radiusKm));
  const qs = params.toString();
  return qs ? `/events?${qs}` : "/events";
}
