import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuthEnvelope } from "@/lib/auth";
import { nostrEventSchema } from "@/lib/validation";
import { ensureUser } from "@/lib/nostr/profile";
import { userToDTO } from "@/lib/dto";
import { notifyEventRecipients } from "@/lib/notifications";

const announcementSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(5000),
  signedAuthEvent: nostrEventSchema,
});

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
  const parsed = announcementSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const event = await prisma.event.findUnique({
    where: { id },
    include: { cohosts: true },
  });
  if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });

  const payload = {
    eventId: id,
    title: parsed.data.title.trim(),
    body: parsed.data.body.trim(),
  };
  const auth = verifyAuthEnvelope(parsed.data.signedAuthEvent, {
    expectedAction: "event.announcement",
    expectedTags: { e: id },
    expectedPayload: payload,
  });
  if (!auth.ok || !auth.pubkey) return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: 401 });
  const allowed = event.organizerPubkey === auth.pubkey || event.cohosts.some((c) => c.pubkey === auth.pubkey);
  if (!allowed) return NextResponse.json({ error: "not an organizer" }, { status: 403 });

  await ensureUser(auth.pubkey);
  const announcement = await prisma.eventAnnouncement.create({
    data: {
      eventId: id,
      pubkey: auth.pubkey,
      title: payload.title,
      body: payload.body,
    },
    include: { author: true },
  });
  await notifyEventRecipients({
    eventId: id,
    type: "ANNOUNCEMENT",
    title: `${event.title}: ${announcement.title}`,
    body: announcement.body,
    skipPubkey: auth.pubkey,
    announcementId: announcement.id,
  });

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
