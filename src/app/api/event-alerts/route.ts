import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPubkey } from "@/lib/session";
import { ensureUser } from "@/lib/nostr/profile";
import { savedEventSearchCreateSchema } from "@/lib/validation";
import { savedSearchData, savedSearchHref } from "@/lib/discovery/saved-search";

export const dynamic = "force-dynamic";

function alertDTO(alert: {
  id: string;
  name: string;
  query: string | null;
  city: string | null;
  tag: string | null;
  category: string | null;
  mode: string | null;
  paid: string | null;
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  lastNotifiedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: alert.id,
    name: alert.name,
    href: savedSearchHref(alert),
    query: alert.query,
    city: alert.city,
    tag: alert.tag,
    category: alert.category,
    mode: alert.mode,
    paid: alert.paid,
    lat: alert.lat,
    lng: alert.lng,
    radiusKm: alert.radiusKm,
    lastNotifiedAt: alert.lastNotifiedAt?.toISOString() ?? null,
    createdAt: alert.createdAt.toISOString(),
  };
}

export async function GET() {
  const pubkey = await getSessionPubkey();
  if (!pubkey) return NextResponse.json({ error: "session required" }, { status: 401 });
  const alerts = await prisma.savedEventSearch.findMany({
    where: { pubkey },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ alerts: alerts.map(alertDTO) });
}

export async function POST(req: Request) {
  const pubkey = await getSessionPubkey();
  if (!pubkey) return NextResponse.json({ error: "session required" }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = savedEventSearchCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existingCount = await prisma.savedEventSearch.count({ where: { pubkey } });
  if (existingCount >= 50) {
    return NextResponse.json({ error: "saved event alert limit reached" }, { status: 409 });
  }

  await ensureUser(pubkey);
  const alert = await prisma.savedEventSearch.create({
    data: savedSearchData(pubkey, parsed.data),
  });
  return NextResponse.json({ alert: alertDTO(alert) }, { status: 201 });
}
