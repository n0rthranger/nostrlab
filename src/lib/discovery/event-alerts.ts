import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyPubkey } from "@/lib/notifications";
import { decodeGeohash } from "@/lib/geohash";
import { findHub, findHubInText } from "@/lib/cities";
import { eventMatchesCategory, type EventCategorySlug } from "@/lib/event-categories";
import { savedSearchHref } from "@/lib/discovery/saved-search";

type AlertRow = Awaited<ReturnType<typeof loadAlerts>>[number];
type EventRow = Awaited<ReturnType<typeof findMatchesForAlert>>[number];

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

function eventPoint(event: { geohash?: string | null; city?: string | null; venue?: string | null }) {
  const geo = event.geohash ? decodeGeohash(event.geohash) : null;
  if (geo) return geo;
  const hub = findHub(event.city) ?? findHubInText(event.city) ?? findHubInText(event.venue);
  return hub ? { lat: hub.lat, lng: hub.lng } : null;
}

async function loadAlerts(limit: number) {
  return prisma.savedEventSearch.findMany({
    orderBy: [{ lastNotifiedAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });
}

function dbMode(mode: string | null): "ONLINE" | "OFFLINE" | "HYBRID" | undefined {
  if (mode === "online") return "ONLINE";
  if (mode === "offline") return "OFFLINE";
  if (mode === "hybrid") return "HYBRID";
  return undefined;
}

function dbPaid(paid: string | null): "FREE" | "PAID" | undefined {
  if (paid === "free") return "FREE";
  if (paid === "paid") return "PAID";
  return undefined;
}

async function findMatchesForAlert(alert: AlertRow, now: Date) {
  const since = alert.lastNotifiedAt ?? alert.createdAt;
  const where: Prisma.EventWhereInput = {
    status: "ACTIVE",
    duplicateOfId: null,
    startsAt: { gte: now },
    createdAt: { gt: since },
    organizerPubkey: { not: alert.pubkey },
  };
  const and: Prisma.EventWhereInput[] = [];
  const mode = dbMode(alert.mode);
  const paid = dbPaid(alert.paid);
  if (mode) where.mode = mode;
  if (paid) where.paymentMode = paid;
  if (alert.tag) where.tags = { some: { tag: alert.tag.toLowerCase() } };
  if (alert.city) {
    and.push({
      OR: [
        { city: { contains: alert.city, mode: "insensitive" } },
        { venue: { contains: alert.city, mode: "insensitive" } },
      ],
    });
  }
  if (alert.query) {
    and.push({
      OR: [
        { title: { contains: alert.query, mode: "insensitive" } },
        { description: { contains: alert.query, mode: "insensitive" } },
        { city: { contains: alert.query, mode: "insensitive" } },
        { venue: { contains: alert.query, mode: "insensitive" } },
      ],
    });
  }
  if (and.length > 0) where.AND = and;

  const rows = await prisma.event.findMany({
    where,
    include: { organizer: true, tags: true, _count: { select: { rsvps: true } } },
    orderBy: { startsAt: "asc" },
    take: alert.category || (alert.lat !== null && alert.lng !== null) ? 100 : 10,
  });

  const category = alert.category as EventCategorySlug | null;
  const origin = alert.lat !== null && alert.lng !== null ? { lat: alert.lat, lng: alert.lng } : null;
  const radius = alert.radiusKm ?? 50;
  return rows
    .filter((event) => !category || eventMatchesCategory(event, category))
    .filter((event) => {
      if (!origin) return true;
      const point = eventPoint(event);
      return !!point && distanceKm(origin, point) <= radius;
    })
    .slice(0, 3);
}

function alertBody(alert: AlertRow, matches: EventRow[]): string {
  const first = matches[0]!;
  const more = matches.length > 1 ? ` and ${matches.length - 1} more` : "";
  return `${first.title}${more} matched ${alert.name}.`;
}

export async function runSavedEventSearchAlerts(limit = 100) {
  const now = new Date();
  const alerts = await loadAlerts(limit);
  const summary = {
    checked: 0,
    matchedAlerts: 0,
    notifications: 0,
  };

  for (const alert of alerts) {
    summary.checked += 1;
    const matches = await findMatchesForAlert(alert, now);
    if (matches.length > 0) {
      summary.matchedAlerts += 1;
      await notifyPubkey({
        pubkey: alert.pubkey,
        type: "DISCOVERY_ALERT",
        title: `New events for ${alert.name}`,
        body: `${alertBody(alert, matches)} Open ${savedSearchHref(alert)} to review the full alert.`,
        eventId: matches[0].id,
      });
      summary.notifications += 1;
    }
    await prisma.savedEventSearch.update({
      where: { id: alert.id },
      data: { lastNotifiedAt: now },
    });
  }

  return { summary };
}

export async function savedEventSearchMetrics() {
  const [savedAlerts, activeAlerts, pendingAlerts] = await Promise.all([
    prisma.savedEventSearch.count(),
    prisma.savedEventSearch.count({ where: { lastNotifiedAt: { not: null } } }),
    prisma.savedEventSearch.count({ where: { lastNotifiedAt: null } }),
  ]);
  return { savedAlerts, activeAlerts, pendingAlerts };
}
