import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { buildTicketCredential } from "@/lib/tickets/proof";

const revealSchema = z.object({
  secret: z.string().min(8),
});

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rl = await rateLimit(`ticket-reveal:${clientIp(req)}:${id}`, { capacity: 20, refillPerSec: 1 / 30 });
  if (!rl.ok) return NextResponse.json({ error: "rate limited" }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const parsed = revealSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true, secret: true, checkedInAt: true },
  });
  if (!ticket) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!safeEqual(ticket.secret, parsed.data.secret)) {
    return NextResponse.json({ error: "ticket secret mismatch" }, { status: 403 });
  }

  let credential;
  try {
    credential = await buildTicketCredential(ticket.id, parsed.data.secret);
  } catch (e) {
    return NextResponse.json({
      error: "ticket credential unavailable",
      message: (e as Error).message,
    }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    id: ticket.id,
    checkedInAt: ticket.checkedInAt,
    credential,
  });
}
