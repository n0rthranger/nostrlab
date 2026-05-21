import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  HUBS,
  findHub,
  findHubInText,
  inferCityName,
  regionForCoordinates,
  regionForText,
  regionLabel,
} from "@/lib/cities";
import { eventToListDTO } from "@/lib/dto";
import { bannedSet } from "@/lib/moderation";
import { decodeGeohash } from "@/lib/geohash";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CITY_SCAN_LIMIT = 1000;

// Returns an entry for every hub city, with:
//   - eventCount (upcoming, indexed)
//   - rsvpCount (sum of GOING RSVPs to upcoming events in that city)
//   - sample events (top 3 closest in time)
// Plus an "Online" bucket for online-only events.
export async function GET() {
  const banned = await bannedSet();
  const where = {
    startsAt: { gte: new Date() },
    status: "ACTIVE" as const,
    duplicateOfId: null,
    ...(banned.size > 0 ? { organizerPubkey: { notIn: [...banned] } } : {}),
  };

  const events = await prisma.event.findMany({
    where,
    orderBy: { startsAt: "asc" },
    take: CITY_SCAN_LIMIT,
    include: { organizer: true, tags: true, _count: { select: { rsvps: { where: { status: "GOING" } } } } },
  });

  type Bucket = {
    slug: string;
    name: string;
    country: string;
    lat: number;
    lng: number;
    eventCount: number;
    rsvpCount: number;
    sample: ReturnType<typeof eventToListDTO>[];
  };

  const buckets = new Map<string, Bucket>();
  for (const h of HUBS) {
    if (buckets.has(h.slug)) continue;
    buckets.set(h.slug, {
      slug: h.slug,
      name: h.name,
      country: h.country,
      lat: h.lat,
      lng: h.lng,
      eventCount: 0,
      rsvpCount: 0,
      sample: [],
    });
  }
  // virtual "online" bucket
  buckets.set("__online__", {
    slug: "__online__",
    name: "Online",
    country: "—",
    lat: 0, lng: 0,
    eventCount: 0,
    rsvpCount: 0,
    sample: [],
  });

  function dynamicBucket(ev: typeof events[number]): Bucket | null {
    const point = ev.geohash ? decodeGeohash(ev.geohash) : null;
    if (!point) return null;
    const name = inferCityName(ev.city, ev.venue);
    if (!name) return null;
    const slug = `geo-${slugify(name) || ev.geohash}`;
    const existing = buckets.get(slug);
    if (existing) return existing;
    const textRegion = regionForText([ev.city, ev.venue].filter(Boolean).join(" "));
    const region = textRegion !== "virtual" ? textRegion : regionForCoordinates(point.lat, point.lng);
    const bucket: Bucket = {
      slug,
      name,
      country: regionLabel(region),
      lat: point.lat,
      lng: point.lng,
      eventCount: 0,
      rsvpCount: 0,
      sample: [],
    };
    buckets.set(slug, bucket);
    return bucket;
  }

  for (const ev of events) {
    const hub = ev.mode === "ONLINE" ? buckets.get("__online__")! : (() => {
      const h = findHub(ev.city) ?? findHubInText(ev.city) ?? findHubInText(ev.venue);
      return h ? buckets.get(h.slug)! : dynamicBucket(ev);
    })();
    if (!hub) continue;
    hub.eventCount += 1;
    hub.rsvpCount += ev._count.rsvps;
    if (hub.sample.length < 3) hub.sample.push(eventToListDTO(ev));
  }

  // Stable order: cities with events first, sorted by eventCount desc, then alphabetical
  const list = [...buckets.values()].sort((a, b) => {
    if (b.eventCount !== a.eventCount) return b.eventCount - a.eventCount;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({ cities: list });
}
