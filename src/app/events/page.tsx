import { prisma } from "@/lib/prisma";
import { eventToListDTO, communityToDTO } from "@/lib/dto";
import { DiscoverDirectory, type CityCount, type CategoryCount } from "@/components/events/DiscoverDirectory";
import { EventFilters } from "@/components/events/EventFilters";
import { EventListingRow } from "@/components/events/EventListingRow";
import { Empty } from "@/components/ui/Empty";
import { bannedSet } from "@/lib/moderation";
import { HUBS, findHub, findHubInText, inferCityName, normalizeCitySlug, regionForCitySlug, regionForCoordinates, regionForText } from "@/lib/cities";
import { EVENT_CATEGORIES, eventCategorySlug, eventMatchesCategory } from "@/lib/event-categories";
import { decodeGeohash } from "@/lib/geohash";
import { slugify } from "@/lib/utils";
import type { EventListItemDTO } from "@/types";
import { eventFilterSchema } from "@/lib/validation";
import { eventModeToDb } from "@/lib/nostr/parse";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const DISCOVERY_SCAN_LIMIT = 1000;

async function getData() {
  const banned = await bannedSet();
  const eventWhere = {
    startsAt: { gte: new Date() },
    status: "ACTIVE" as const,
    duplicateOfId: null,
    ...(banned.size > 0 ? { organizerPubkey: { notIn: [...banned] } } : {}),
  };

  const [events, communities, communityEventCounts] = await Promise.all([
    prisma.event.findMany({
      where: eventWhere,
      orderBy: { startsAt: "asc" },
      take: DISCOVERY_SCAN_LIMIT,
      include: {
        organizer: true,
        tags: true,
        _count: { select: { rsvps: true } },
      },
    }),
    prisma.community.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        organizer: true,
        tags: true,
        _count: { select: { events: true, followers: true } },
      },
    }),
    prisma.event.groupBy({
      by: ["communityId"],
      where: { ...eventWhere },
      _count: { _all: true },
    }),
  ]);

  const upcomingPerCommunity = new Map<string, number>();
  for (const c of communityEventCounts) {
    if (c.communityId) upcomingPerCommunity.set(c.communityId, c._count._all);
  }

  const dtos = events.map(eventToListDTO);

  function eventCityName(e: EventListItemDTO): string {
    if (e.mode === "ONLINE") return "Online";
    return inferCityName(e.city, e.venue) ?? "Other";
  }

  const byCity = new Map<string, EventListItemDTO[]>();
  for (const e of dtos) {
    const key = eventCityName(e);
    if (!byCity.has(key)) byCity.set(key, []);
    byCity.get(key)!.push(e);
  }
  const cityEntries = [...byCity.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([k, v]) => [k, v] as [string, EventListItemDTO[]]);
  const popularByCity = new Map<string, EventListItemDTO[]>([
    ["All", dtos],
    ...cityEntries,
  ]);
  const defaultCity = "All";

  const categoryCounts = new Map(EVENT_CATEGORIES.map((category) => [category.slug, 0]));
  for (const event of events) {
    const slug = eventCategorySlug(event);
    categoryCounts.set(slug, (categoryCounts.get(slug) ?? 0) + 1);
  }
  const categories: CategoryCount[] = EVENT_CATEGORIES.map((def) => ({
    slug: def.slug,
    label: def.label,
    emoji: def.emoji,
    count: categoryCounts.get(def.slug) ?? 0,
  }));

  const citiesBySlug = new Map<string, CityCount>();
  for (const h of HUBS) {
    const slug = normalizeCitySlug(h.slug);
    if (citiesBySlug.has(slug)) continue;
    citiesBySlug.set(slug, {
      slug,
      name: h.name,
      region: regionForCitySlug(h.slug),
      count: 0,
    });
  }
  citiesBySlug.set("__online__", {
    slug: "__online__",
    name: "Online",
    region: "virtual",
    count: 0,
  });

  function incrementCity(city: CityCount) {
    const existing = citiesBySlug.get(city.slug);
    if (existing) {
      existing.count += 1;
      return;
    }
    citiesBySlug.set(city.slug, { ...city, count: 1 });
  }

  for (const e of dtos) {
    if (e.mode === "ONLINE") {
      citiesBySlug.get("__online__")!.count += 1;
      continue;
    }
    const hub = findHub(e.city) ?? findHubInText(e.city) ?? findHubInText(e.venue);
    if (hub) {
      const slug = normalizeCitySlug(hub.slug);
      const existing = citiesBySlug.get(slug);
      if (existing) existing.count += 1;
      continue;
    }

    const name = inferCityName(e.city, e.venue);
    if (!name) continue;
    const point = e.geohash ? decodeGeohash(e.geohash) : null;
    const textRegion = regionForText([e.city, e.venue].filter(Boolean).join(" "));
    const region = textRegion !== "virtual" ? textRegion : point ? regionForCoordinates(point.lat, point.lng) : "virtual";
    incrementCity({
      slug: slugify(name) || "other",
      name,
      region,
      count: 0,
    });
  }

  const cities: CityCount[] = [...citiesBySlug.values()];

  const communityDTOs = communities.map((c) =>
    communityToDTO(c, upcomingPerCommunity.get(c.id) ?? 0)
  );

  return { popularByCity, defaultCity, categories, communities: communityDTOs, cities };
}

function hasSearchParams(sp: Record<string, string | undefined>): boolean {
  return ["q", "city", "tag", "category", "mode", "paid", "from", "to", "status", "view", "lat", "lng"].some((k) => !!sp[k]);
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (n: number) => n * Math.PI / 180;
  const r = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function eventPoint(event: { geohash?: string | null; city?: string | null; venue?: string | null }): { lat: number; lng: number } | null {
  const geo = event.geohash ? decodeGeohash(event.geohash) : null;
  if (geo) return geo;
  const hub = findHub(event.city) ?? findHubInText(event.city) ?? findHubInText(event.venue);
  return hub ? { lat: hub.lat, lng: hub.lng } : null;
}

async function getSearchResults(sp: Record<string, string | undefined>) {
  const parsed = eventFilterSchema.safeParse(sp);
  if (!parsed.success) return { events: [], error: "Those filters are invalid." };
  const f = parsed.data;
  const banned = await bannedSet();
  const where: Prisma.EventWhereInput = {};
  const and: Prisma.EventWhereInput[] = [];
  where.duplicateOfId = null;
  if (f.city) {
    and.push({
      OR: [
        { city: { contains: f.city, mode: "insensitive" } },
        { venue: { contains: f.city, mode: "insensitive" } },
      ],
    });
  }
  if (f.mode) where.mode = eventModeToDb(f.mode);
  if (f.paid === "free") where.paymentMode = "FREE";
  if (f.paid === "paid") where.paymentMode = "PAID";
  if (f.status === "cancelled") where.status = "CANCELLED";
  else if (f.status !== "all") where.status = "ACTIVE";
  if (f.from || f.to) {
    where.startsAt = {
      gte: f.from ? new Date(f.from) : new Date(),
      ...(f.to ? { lte: new Date(f.to) } : {}),
    };
  } else {
    where.startsAt = { gte: new Date(Date.now() - 1000 * 60 * 60 * 12) };
  }
  if (f.tag) where.tags = { some: { tag: f.tag.toLowerCase() } };
  if (f.q) {
    and.push({
      OR: [
        { title: { contains: f.q, mode: "insensitive" } },
        { description: { contains: f.q, mode: "insensitive" } },
        { city: { contains: f.q, mode: "insensitive" } },
        { venue: { contains: f.q, mode: "insensitive" } },
      ],
    });
  }
  if (banned.size > 0) where.organizerPubkey = { notIn: [...banned] };
  if (and.length > 0) where.AND = and;

  const rows = await prisma.event.findMany({
    where,
    orderBy: { startsAt: "asc" },
    take: f.lat !== undefined && f.lng !== undefined ? 200 : f.category ? DISCOVERY_SCAN_LIMIT : f.limit,
    include: {
      organizer: true,
      tags: true,
      _count: { select: { rsvps: true } },
    },
  });
  const categoryRows = f.category
    ? rows.filter((row) => eventMatchesCategory(row, f.category!)).slice(0, f.limit)
    : rows;

  if (f.lat !== undefined && f.lng !== undefined) {
    const origin = { lat: f.lat, lng: f.lng };
    const nearby = categoryRows
      .map((row) => {
        const point = eventPoint(row);
        return point ? { row, km: distanceKm(origin, point) } : null;
      })
      .filter((item): item is { row: typeof rows[number]; km: number } => !!item && item.km <= f.radius)
      .sort((a, b) => a.km - b.km || a.row.startsAt.getTime() - b.row.startsAt.getTime())
      .slice(0, f.limit)
      .map((item) => eventToListDTO(item.row));
    return { events: nearby, error: null };
  }
  return { events: categoryRows.map(eventToListDTO), error: null };
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  if (hasSearchParams(sp)) {
    const { events, error } = await getSearchResults(sp);
    return (
      <div className="max-w-5xl mx-auto px-5 py-10 md:py-14 space-y-8">
        <header>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] mb-3 bg-gradient-to-r from-violet-600 to-orange-500 bg-clip-text text-transparent">
            Events
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-[-0.025em]">
            {sp.lat && sp.lng ? "Events near you" : "Find a meetup"}
          </h1>
          <p className="text-muted text-lg mt-2 max-w-prose">
            Search by city, topic, format, and ticket type.
          </p>
        </header>
        <div className="rounded-2xl bg-surface border border-border shadow-soft p-4">
          <EventFilters />
        </div>
        {error ? (
          <Empty title="Invalid filters" hint={error} />
        ) : events.length === 0 ? (
          <Empty title="No matching events" hint="Try another city, tag, or format." />
        ) : (
          <div className="rounded-2xl bg-surface border border-border shadow-soft p-2 space-y-1">
            {events.map((event) => <EventListingRow key={event.id} event={event} />)}
          </div>
        )}
      </div>
    );
  }

  const data = await getData();
  return (
    <DiscoverDirectory
      popularByCity={Object.fromEntries(data.popularByCity)}
      defaultCity={data.defaultCity}
      categories={data.categories}
      communities={data.communities}
      cities={data.cities}
    />
  );
}
