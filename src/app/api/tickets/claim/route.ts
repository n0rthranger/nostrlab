import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { claimPaymentWithPreimage } from "@/lib/payments/reconcile";

const claimSchema = z.object({
  paymentId: z.string().min(1),
  preimage: z.string().regex(/^[0-9a-f]{64}$/i, "preimage must be 64 hex characters"),
});

/**
 * POST /api/tickets/claim
 * Recovery path: buyer paid the invoice but the polling didn't catch the
 * settlement (LSP without LUD-21, server crash, network failure).
 * They paste their preimage from their wallet; we verify sha256(preimage)
 * matches the bolt11's payment hash, then issue the ticket.
 *
 * No auth needed — preimage is itself the proof of payment.
 */
export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { paymentId, preimage } = parsed.data;

  const ip = clientIp(req);
  const rl = await rateLimit(`claim:${ip}`, { capacity: 8, refillPerSec: 1 / 10 });
  if (!rl.ok) return NextResponse.json({ error: "rate limited" }, { status: 429 });

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return NextResponse.json({ error: "payment not found" }, { status: 404 });

  const computedHash = crypto.createHash("sha256")
    .update(Buffer.from(preimage.toLowerCase(), "hex"))
    .digest("hex");

  if (computedHash !== payment.paymentHash.toLowerCase()) {
    return NextResponse.json({
      error: "PREIMAGE_MISMATCH",
      message: "That preimage doesn't match this invoice. Make sure you're pasting the preimage from this exact payment.",
    }, { status: 400 });
  }

  const result = await claimPaymentWithPreimage(payment.id, preimage);
  if (result.status !== "PAID" || !result.ticketId || !result.ticketSecret) {
    return NextResponse.json({ error: "CLAIM_FAILED", status: result.status }, { status: 409 });
  }
  return NextResponse.json({
    ticketId: result.ticketId,
    ticketSecret: result.ticketSecret,
    alreadyClaimed: !result.issued,
  });
}
