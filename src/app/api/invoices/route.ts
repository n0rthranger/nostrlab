import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invoiceCreateSchema } from "@/lib/validation";
import {
  getLightningMode,
  resolveLud16,
  requestInvoice,
  extractExpirySec,
  createMockInvoice,
} from "@/lib/lightning";
import { rateLimit } from "@/lib/rate-limit";
import { ensureUser } from "@/lib/nostr/profile";
import { getSessionPubkey } from "@/lib/session";

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const parsed = invoiceCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { eventId, buyerPubkey, tierId } = parsed.data;
  const sessionPubkey = await getSessionPubkey();
  if (!sessionPubkey || sessionPubkey !== buyerPubkey.toLowerCase()) {
    return NextResponse.json({ error: "buyer session required" }, { status: 401 });
  }

  const rl = await rateLimit(`invoice:${buyerPubkey}`, { capacity: 6, refillPerSec: 1 / 30 });
  if (!rl.ok) return NextResponse.json({ error: "rate limited" }, { status: 429 });

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { organizer: true },
  });
  if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });
  if (event.status === "CANCELLED") {
    return NextResponse.json({ error: "event is cancelled" }, { status: 409 });
  }
  if (event.paymentMode !== "PAID" || !event.priceSats) {
    return NextResponse.json({ error: "event is free" }, { status: 400 });
  }

  const tier = tierId
    ? await prisma.ticketTier.findFirst({ where: { id: tierId, eventId } })
    : null;
  if (tierId && !tier) return NextResponse.json({ error: "ticket tier not found" }, { status: 404 });
  const now = new Date();
  if (tier?.salesStartAt && tier.salesStartAt > now) {
    return NextResponse.json({ error: "ticket tier is not on sale yet" }, { status: 409 });
  }
  if (tier?.salesEndAt && tier.salesEndAt < now) {
    return NextResponse.json({ error: "ticket tier sales ended" }, { status: 409 });
  }
  const amountSats = tier?.priceSats ?? event.priceSats;

  // Idempotency — return any pending unexpired invoice for this buyer.
  const existing = await prisma.payment.findFirst({
    where: {
      eventId,
      buyerPubkey,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
  });
  if (existing) {
    return NextResponse.json({
      paymentId: existing.id,
      paymentHash: existing.paymentHash,
      bolt11: existing.bolt11,
      amountSats: existing.amountSats,
      expiresAt: existing.expiresAt,
      provider: existing.provider,
      status: existing.status,
    });
  }

  // Already own a ticket? Short-circuit.
  const ticket = await prisma.ticket.findFirst({
    where: { eventId, buyerPubkey },
    select: { id: true },
  });
  if (ticket) return NextResponse.json({ alreadyOwnsTicketId: ticket.id }, { status: 409 });

  if (tier?.quantity) {
    const held = await prisma.payment.count({
      where: {
        eventId,
        tierId: tier.id,
        OR: [
          { status: "PAID" },
          { status: "PENDING", expiresAt: { gt: new Date() } },
        ],
      },
    });
    if (held >= tier.quantity) {
      return NextResponse.json({ error: "ticket tier is sold out" }, { status: 409 });
    }
  }

  if (event.capacity) {
    const held = await prisma.payment.count({
      where: {
        eventId,
        OR: [
          { status: "PAID" },
          { status: "PENDING", expiresAt: { gt: new Date() } },
        ],
      },
    });
    if (held >= event.capacity) {
      return NextResponse.json({ error: "event is sold out" }, { status: 409 });
    }
  }

  await ensureUser(buyerPubkey);

  const mode = getLightningMode();
  if (mode === "none") {
    return NextResponse.json({ error: "Lightning is disabled on this server." }, { status: 503 });
  }

  // ---- Mock mode: simulate an instant Lightning rail for local testing.
  if (mode === "mock") {
    const m = createMockInvoice(amountSats, `NostrLab ticket — ${event.title}`);
    const reservation = await reservePayment({
      eventId,
      buyerPubkey,
      amountSats,
      bolt11: m.bolt11,
      paymentHash: m.paymentHash,
      provider: "mock",
      providerRef: "mock",
      verifyUrl: null,
      tierId: tier?.id ?? null,
      expiresAt: m.expiresAt,
    });
    return paymentReservationResponse(reservation, { mock: true });
  }

  // ---- LNURL mode: invoice is issued by the organizer's own Lightning wallet.
  const lud16 = event.organizer.lud16;
  if (!lud16) {
    return NextResponse.json({
      error: "PAYOUT_NOT_CONFIGURED",
      message:
        "The organizer hasn't set a Lightning Address in their Nostr profile. They need a `lud16` field (e.g. alice@strike.me) to receive sats.",
    }, { status: 412 });
  }

  let meta;
  try { meta = await resolveLud16(lud16); }
  catch (e) {
    return NextResponse.json({
      error: "PAYOUT_RESOLVE_FAILED",
      message: `Couldn't resolve organizer's Lightning Address (${lud16}): ${(e as Error).message}`,
    }, { status: 502 });
  }

  const amountMsat = amountSats * 1000;
  if (amountMsat < meta.minSendable || amountMsat > meta.maxSendable) {
    return NextResponse.json({
      error: "AMOUNT_OUT_OF_RANGE",
      message: `Organizer's wallet only accepts ${Math.floor(meta.minSendable / 1000)}–${Math.floor(meta.maxSendable / 1000)} sats per payment.`,
    }, { status: 422 });
  }

  let inv;
  try {
    inv = await requestInvoice(meta.callback, amountMsat, `NostrLab · ${event.title}`);
  } catch (e) {
    return NextResponse.json({
      error: "INVOICE_REQUEST_FAILED",
      message: `Couldn't get an invoice from the organizer's wallet: ${(e as Error).message}`,
    }, { status: 502 });
  }

  // Idempotency on payment_hash — if somehow we get the same hash, reuse.
  const dupe = await prisma.payment.findUnique({ where: { paymentHash: inv.paymentHash } });
  if (dupe) {
    return NextResponse.json({
      paymentId: dupe.id,
      paymentHash: dupe.paymentHash,
      bolt11: dupe.bolt11,
      amountSats: dupe.amountSats,
      expiresAt: dupe.expiresAt,
      provider: dupe.provider,
      status: dupe.status,
    });
  }

  const expirySec = extractExpirySec(inv.bolt11);
  const expiresAt = new Date(Date.now() + Math.min(expirySec, Number(process.env.INVOICE_EXPIRY_SECONDS ?? 900)) * 1000);

  const reservation = await reservePayment({
    eventId,
    buyerPubkey,
    amountSats,
    bolt11: inv.bolt11,
    paymentHash: inv.paymentHash,
    provider: "lnurl",
    providerRef: lud16,
    verifyUrl: inv.verifyUrl,
    tierId: tier?.id ?? null,
    expiresAt,
  });
  return paymentReservationResponse(reservation, { canVerify: "payment" in reservation ? !!reservation.payment?.verifyUrl : false });
}

interface PaymentDraft {
  eventId: string;
  buyerPubkey: string;
  amountSats: number;
  bolt11: string;
  paymentHash: string;
  provider: string;
  providerRef: string | null;
  verifyUrl: string | null;
  tierId: string | null;
  expiresAt: Date;
}

interface LockedTier {
  id: string;
  quantity: number | null;
  salesStartAt: Date | null;
  salesEndAt: Date | null;
}

async function reservePayment(draft: PaymentDraft) {
  return prisma.$transaction(async (tx) => {
    const lockedEvents = await tx.$queryRaw<{
      id: string;
      status: "ACTIVE" | "CANCELLED";
      paymentMode: "FREE" | "PAID";
      priceSats: number | null;
      capacity: number | null;
    }[]>(Prisma.sql`
      SELECT id, status, "paymentMode" AS "paymentMode", "priceSats" AS "priceSats", capacity
      FROM "Event"
      WHERE id = ${draft.eventId}
      FOR UPDATE
    `);
    const lockedEvent = lockedEvents[0];
    if (!lockedEvent) return { error: "event not found", status: 404 as const };
    if (lockedEvent.status === "CANCELLED") return { error: "event is cancelled", status: 409 as const };
    if (lockedEvent.paymentMode !== "PAID" || !lockedEvent.priceSats) {
      return { error: "event is free", status: 400 as const };
    }

    let lockedTier: LockedTier | null = null;
    if (draft.tierId) {
      const lockedTiers = await tx.$queryRaw<LockedTier[]>(Prisma.sql`
        SELECT id, quantity, "salesStartAt" AS "salesStartAt", "salesEndAt" AS "salesEndAt"
        FROM "TicketTier"
        WHERE id = ${draft.tierId} AND "eventId" = ${draft.eventId}
        FOR UPDATE
      `);
      lockedTier = lockedTiers[0] ?? null;
      if (!lockedTier) return { error: "ticket tier not found", status: 404 as const };
      const now = new Date();
      if (lockedTier.salesStartAt && lockedTier.salesStartAt > now) {
        return { error: "ticket tier is not on sale yet", status: 409 as const };
      }
      if (lockedTier.salesEndAt && lockedTier.salesEndAt < now) {
        return { error: "ticket tier sales ended", status: 409 as const };
      }
    }

    const existing = await tx.payment.findFirst({
      where: {
        eventId: draft.eventId,
        buyerPubkey: draft.buyerPubkey,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });
    if (existing) return { payment: existing };

    const ticket = await tx.ticket.findFirst({
      where: { eventId: draft.eventId, buyerPubkey: draft.buyerPubkey },
      select: { id: true },
    });
    if (ticket) return { alreadyOwnsTicketId: ticket.id };

    if (lockedTier?.quantity) {
      const held = await tx.payment.count({
        where: {
          eventId: draft.eventId,
          tierId: lockedTier.id,
          OR: [
            { status: "PAID" },
            { status: "PENDING", expiresAt: { gt: new Date() } },
          ],
        },
      });
      if (held >= lockedTier.quantity) {
        return { error: "ticket tier is sold out", status: 409 as const };
      }
    }

    if (lockedEvent.capacity) {
      const held = await tx.payment.count({
        where: {
          eventId: draft.eventId,
          OR: [
            { status: "PAID" },
            { status: "PENDING", expiresAt: { gt: new Date() } },
          ],
        },
      });
      if (held >= lockedEvent.capacity) {
        return { error: "event is sold out", status: 409 as const };
      }
    }

    const payment = await tx.payment.create({
      data: {
        eventId: draft.eventId,
        buyerPubkey: draft.buyerPubkey,
        amountSats: draft.amountSats,
        bolt11: draft.bolt11,
        paymentHash: draft.paymentHash,
        provider: draft.provider,
        providerRef: draft.providerRef,
        verifyUrl: draft.verifyUrl,
        tierId: draft.tierId,
        expiresAt: draft.expiresAt,
      },
    });
    return { payment };
  });
}

function paymentReservationResponse(
  reservation: Awaited<ReturnType<typeof reservePayment>>,
  extra: Record<string, unknown> = {}
) {
  if ("alreadyOwnsTicketId" in reservation) {
    return NextResponse.json({ alreadyOwnsTicketId: reservation.alreadyOwnsTicketId }, { status: 409 });
  }
  if ("error" in reservation) {
    return NextResponse.json({ error: reservation.error }, { status: reservation.status });
  }
  const payment = reservation.payment;
  return NextResponse.json({
    paymentId: payment.id,
    paymentHash: payment.paymentHash,
    bolt11: payment.bolt11,
    amountSats: payment.amountSats,
    expiresAt: payment.expiresAt,
    provider: payment.provider,
    status: payment.status,
    ...extra,
  });
}

// crypto is imported above to keep the bundle resolved; some bundlers need
// the explicit reference.
void crypto;
