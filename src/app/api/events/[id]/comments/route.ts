import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuthEnvelope } from "@/lib/auth";
import { nostrEventSchema } from "@/lib/validation";
import { ensureUser } from "@/lib/nostr/profile";
import { userToDTO } from "@/lib/dto";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";

const commentSchema = z.object({
  body: z.string().min(1).max(2000),
  signedAuthEvent: nostrEventSchema,
});

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
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const event = await prisma.event.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });
  if (event.status === "CANCELLED") return NextResponse.json({ error: "event is cancelled" }, { status: 409 });

  const payload = { eventId: id, body: parsed.data.body.trim() };
  const auth = verifyAuthEnvelope(parsed.data.signedAuthEvent, {
    expectedAction: "event.comment",
    expectedTags: { e: id },
    expectedPayload: payload,
  });
  if (!auth.ok || !auth.pubkey) return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: 401 });

  await ensureUser(auth.pubkey);
  const comment = await prisma.eventComment.create({
    data: {
      eventId: id,
      pubkey: auth.pubkey,
      body: payload.body,
      nostrId: parsed.data.signedAuthEvent.id,
    },
    include: { user: true },
  });

  return NextResponse.json({
    comment: {
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      user: userToDTO(comment.user),
    },
  });
}
