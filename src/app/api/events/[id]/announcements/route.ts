import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { announcementCreateSchema } from "@/lib/validation";
import { userToDTO } from "@/lib/dto";
import { ingestEventComment } from "@/lib/nostr/ingest-social";
import { publishToRelays } from "@/lib/nostr/relay-pool";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const announcements = await prisma.eventAnnouncement.findMany({
    where: { eventId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { author: true },
  });
  return NextResponse.json({
    announcements: announcements.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      createdAt: a.createdAt.toISOString(),
      author: userToDTO(a.author),
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = announcementCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const event = await prisma.event.findUnique({ where: { id }, select: { id: true } });
  if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });

  const result = await ingestEventComment(parsed.data.signedAnnouncementEvent, {
    expectedEventId: id,
    expectedAnnouncement: true,
    notifyAnnouncements: true,
  });
  if (result.status === "skipped" || result.type !== "announcement" || !result.id) {
    const status = result.reason === "not an organizer" ? 403 : 400;
    return NextResponse.json({ error: result.reason ?? "invalid announcement" }, { status });
  }

  const announcement = await prisma.eventAnnouncement.findUnique({
    where: { id: result.id },
    include: { author: true },
  });
  if (!announcement) return NextResponse.json({ error: "announcement not found" }, { status: 500 });

  if (result.status === "stored") publishToRelays(parsed.data.signedAnnouncementEvent).catch(() => {});

  return NextResponse.json({
    announcement: {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      createdAt: announcement.createdAt.toISOString(),
      author: userToDTO(announcement.author),
    },
  });
}
