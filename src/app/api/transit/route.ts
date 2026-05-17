import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eventToListDTO } from "@/lib/dto";
import { bannedSet } from "@/lib/moderation";
import { findStation, LINE_COLORS, STATIONS } from "@/lib/transit-layout";
import type { EventListItemDTO } from "@/types";

export const dynamic = "force-dynamic";

interface StationData {
  slug: string;
  name: string;
  x: number;
  y: number;
  region: string;
  eventCount: number;
  rsvpCount: number;
  events: EventListItemDTO[];
}

interface LineData {
  id: string;            // community slug or "__local__"
  name: string;
  color: string;
  letter: string;        // single letter / number for the bullet
  stations: string[];    // ordered list of station slugs the line visits
  eventCount: number;
  rsvpCount: number;
  events: EventListItemDTO[];
}

// We pre-seed empty stations so every plotted city is visible on the map
// even before it has events. That makes the network feel like a real,
// established system rather than an empty void.
function emptyStationData(): Map<string, StationData> {
  const map = new Map<string, StationData>();
  for (const s of STATIONS) {
    map.set(s.slug, {
      slug: s.slug,
      name: s.name,
      x: s.x,
      y: s.y,
      region: s.region,
      eventCount: 0,
      rsvpCount: 0,
      events: [],
    });
  }
  return map;
}

export async function GET() {
  const banned = await bannedSet();
  const where = {
    startsAt: { gte: new Date() },
    status: "ACTIVE" as const,
    ...(banned.size > 0 ? { organizerPubkey: { notIn: [...banned] } } : {}),
  };

  const events = await prisma.event.findMany({
    where,
    orderBy: { startsAt: "asc" },
    take: 200,
    include: {
      organizer: true,
      tags: true,
      community: true,
      _count: { select: { rsvps: { where: { status: "GOING" } } } },
    },
  });

  // Aggregate stations
  const stationMap = emptyStationData();
  for (const ev of events) {
    let slug: string | null = null;
    if (ev.mode === "ONLINE") slug = "__online__";
    else if (ev.city) slug = findStation(ev.city)?.slug ?? null;
    if (!slug) continue;
    const s = stationMap.get(slug)!;
    s.eventCount += 1;
    s.rsvpCount += ev._count.rsvps;
    s.events.push(eventToListDTO(ev));
  }

  // Aggregate lines — one per community plus a virtual "Local" line for
  // events that aren't tied to a community.
  const lineMap = new Map<string, LineData>();
  let colorIdx = 0;

  function ensureLine(id: string, name: string, color: string, letter: string): LineData {
    const existing = lineMap.get(id);
    if (existing) return existing;
    const line: LineData = {
      id, name, color, letter,
      stations: [],
      eventCount: 0,
      rsvpCount: 0,
      events: [],
    };
    lineMap.set(id, line);
    return line;
  }

  for (const ev of events) {
    let lineId: string;
    let lineName: string;
    let lineLetter: string;

    if (ev.community) {
      lineId = ev.community.slug;
      lineName = ev.community.name;
      lineLetter = ev.community.name.charAt(0).toUpperCase();
    } else {
      lineId = "__local__";
      lineName = "Local";
      lineLetter = "L";
    }

    let line = lineMap.get(lineId);
    if (!line) {
      const color = lineId === "__local__"
        ? "#0a0a0a"
        : LINE_COLORS[colorIdx++ % LINE_COLORS.length];
      line = ensureLine(lineId, lineName, color, lineLetter);
    }

    line.eventCount += 1;
    line.rsvpCount += ev._count.rsvps;
    line.events.push(eventToListDTO(ev));

    // Add this event's station to the line's path (in chronological order,
    // which matches our findMany ordering).
    let stationSlug: string | null = null;
    if (ev.mode === "ONLINE") stationSlug = "__online__";
    else if (ev.city) stationSlug = findStation(ev.city)?.slug ?? null;
    if (stationSlug && line.stations[line.stations.length - 1] !== stationSlug) {
      line.stations.push(stationSlug);
    }
  }

  // For lines with only one station, duplicate that station so the line is
  // still visually anchored (otherwise it's invisible).
  for (const line of lineMap.values()) {
    if (line.stations.length === 1) {
      line.stations.push(line.stations[0]);
    }
  }

  const stations = [...stationMap.values()];
  const lines = [...lineMap.values()].sort((a, b) => b.eventCount - a.eventCount);

  return NextResponse.json({
    stations,
    lines,
    summary: {
      totalEvents: events.length,
      activeStations: stations.filter((s) => s.eventCount > 0).length,
      totalLines: lines.length,
    },
  });
}
