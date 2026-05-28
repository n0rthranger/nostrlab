import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { commentCreateSchema } from "@/lib/validation";
import { userToDTO } from "@/lib/dto";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { ingestEventComment } from "@/lib/nostr/ingest-social";
import { publishToRelays } from "@/lib/nostr/relay-pool";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comments = await prisma.eventComment.findMany({
    where: { eventId: id },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: { user: true },
  });
  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      user: userToDTO(c.user),
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rl = await rateLimit(`comment:${clientIp(req)}`, { capacity: 20, refillPerSec: 1 / 10 });
  if (!rl.ok) return NextResponse.json({ error: "rate limited" }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = commentCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const event = await prisma.event.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });
  if (event.status === "CANCELLED") return NextResponse.json({ error: "event is cancelled" }, { status: 409 });

  const result = await ingestEventComment(parsed.data.signedCommentEvent, {
    expectedEventId: id,
    expectedAnnouncement: false,
  });
  if (result.status === "skipped" || result.type !== "comment" || !result.id) {
    return NextResponse.json({ error: result.reason ?? "invalid comment" }, { status: 400 });
  }

  const comment = await prisma.eventComment.findUnique({
    where: { id: result.id },
    include: { user: true },
  });
  if (!comment) return NextResponse.json({ error: "comment not found" }, { status: 500 });

  if (result.status === "stored") publishToRelays(parsed.data.signedCommentEvent).catch(() => {});

  return NextResponse.json({
    comment: {
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      user: userToDTO(comment.user),
    },
  });
}
