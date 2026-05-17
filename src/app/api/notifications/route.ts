import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionPubkey } from "@/lib/session";

export async function GET() {
  const pubkey = await getSessionPubkey();
  if (!pubkey) return NextResponse.json({ error: "session required" }, { status: 401 });
  const notifications = await prisma.notification.findMany({
    where: { recipientPubkey: pubkey },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { event: { select: { id: true, title: true, startsAt: true } } },
  });
  return NextResponse.json({
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      event: n.event ? {
        id: n.event.id,
        title: n.event.title,
        startsAt: n.event.startsAt.toISOString(),
      } : null,
      ticketId: n.ticketId,
    })),
  });
}

const patchSchema = z.object({
  ids: z.array(z.string()).max(100).optional(),
  all: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const pubkey = await getSessionPubkey();
  if (!pubkey) return NextResponse.json({ error: "session required" }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const where = parsed.data.all
    ? { recipientPubkey: pubkey, readAt: null }
    : { recipientPubkey: pubkey, id: { in: parsed.data.ids ?? [] } };
  await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true });
}
