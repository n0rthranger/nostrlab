import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkMockInvoice, verifyInvoice } from "@/lib/lightning";
import { notifyPubkey } from "@/lib/notifications";
import { createTicketProofEvent } from "@/lib/tickets/proof";

export type PaymentReconcileResult =
  | { status: "NOT_FOUND" }
  | { status: "PENDING"; requiresClaim?: boolean; warning?: string }
  | { status: "EXPIRED" }
  | { status: "FAILED"; warning: string }
  | {
      status: "PAID";
      paidAt: Date | null;
      ticketId: string | null;
      ticketSecret: string | null;
      issued: boolean;
    };

function preimageMatches(paymentHash: string, preimage: string): boolean {
  const actualHash = crypto.createHash("sha256")
    .update(Buffer.from(preimage.toLowerCase(), "hex"))
    .digest("hex");
  return actualHash === paymentHash.toLowerCase();
}

async function settlePayment(paymentId: string, preimage: string | null): Promise<PaymentReconcileResult> {
  const settled = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`);
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: {
        tier: true,
        event: {
          select: {
            id: true,
            title: true,
            nostrId: true,
            organizerPubkey: true,
            dTag: true,
          },
        },
      },
    });
    if (!payment) return { status: "NOT_FOUND" as const };

    if (payment.status === "PAID") {
      const ticket = await tx.ticket.findUnique({ where: { paymentId: payment.id } });
      if (ticket && (!ticket.nostrId || !ticket.rawEvent) && payment.preimage) {
        const proof = createTicketProofEvent({
          ticketId: ticket.id,
          secret: ticket.secret,
          eventId: payment.eventId,
          eventNostrId: payment.event.nostrId,
          organizerPubkey: payment.event.organizerPubkey,
          eventDTag: payment.event.dTag,
          buyerPubkey: payment.buyerPubkey,
          tier: ticket.tier,
          payment: {
            provider: payment.provider,
            paymentHash: payment.paymentHash,
            amountSats: payment.amountSats,
            preimage: payment.preimage,
          },
        });
        await tx.ticket.update({
          where: { id: ticket.id },
          data: {
            nostrId: proof.id,
            rawEvent: proof as unknown as Prisma.InputJsonValue,
          },
        });
      }
      return {
        status: "PAID" as const,
        paidAt: payment.paidAt,
        ticketId: ticket?.id ?? null,
        ticketSecret: ticket?.secret ?? null,
        buyerPubkey: payment.buyerPubkey,
        eventId: payment.eventId,
        eventTitle: payment.event.title,
        issued: false,
      };
    }

    if (payment.status === "EXPIRED") return { status: "EXPIRED" as const };
    if (payment.status === "FAILED") return { status: "FAILED" as const, warning: "payment already failed" };

    if (preimage && !preimageMatches(payment.paymentHash, preimage)) {
      return { status: "FAILED" as const, warning: "preimage mismatch" };
    }
    if (!preimage) {
      return {
        status: "PENDING" as const,
        requiresClaim: true,
        warning: "Lightning settlement needs the payment preimage before issuing a paid ticket proof",
      };
    }

    const paidAt = new Date();
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        paidAt,
        preimage,
      },
    });
    const existing = await tx.ticket.findUnique({ where: { paymentId: updated.id } });
    if (existing) {
      if (!existing.nostrId || !existing.rawEvent) {
        const proof = createTicketProofEvent({
          ticketId: existing.id,
          secret: existing.secret,
          eventId: updated.eventId,
          eventNostrId: payment.event.nostrId,
          organizerPubkey: payment.event.organizerPubkey,
          eventDTag: payment.event.dTag,
          buyerPubkey: updated.buyerPubkey,
          tier: existing.tier,
          payment: {
            provider: updated.provider,
            paymentHash: updated.paymentHash,
            amountSats: updated.amountSats,
            preimage: updated.preimage,
          },
        });
        await tx.ticket.update({
          where: { id: existing.id },
          data: {
            nostrId: proof.id,
            rawEvent: proof as unknown as Prisma.InputJsonValue,
          },
        });
      }
      return {
        status: "PAID" as const,
        paidAt: updated.paidAt,
        ticketId: existing.id,
        ticketSecret: existing.secret,
        buyerPubkey: updated.buyerPubkey,
        eventId: updated.eventId,
        eventTitle: payment.event.title,
        issued: false,
      };
    }
    const ticket = await tx.ticket.create({
      data: {
        eventId: updated.eventId,
        buyerPubkey: updated.buyerPubkey,
        paymentId: updated.id,
        tierId: updated.tierId,
        tier: payment.tier?.name ?? "general",
        secret: crypto.randomUUID().replace(/-/g, ""),
      },
    });
    const proof = createTicketProofEvent({
      ticketId: ticket.id,
      secret: ticket.secret,
      eventId: updated.eventId,
      eventNostrId: payment.event.nostrId,
      organizerPubkey: payment.event.organizerPubkey,
      eventDTag: payment.event.dTag,
      buyerPubkey: updated.buyerPubkey,
      tier: ticket.tier,
      payment: {
        provider: updated.provider,
        paymentHash: updated.paymentHash,
        amountSats: updated.amountSats,
        preimage: updated.preimage,
      },
    });
    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        nostrId: proof.id,
        rawEvent: proof as unknown as Prisma.InputJsonValue,
      },
    });
    return {
      status: "PAID" as const,
      paidAt: updated.paidAt,
      ticketId: ticket.id,
      ticketSecret: ticket.secret,
      buyerPubkey: updated.buyerPubkey,
      eventId: updated.eventId,
      eventTitle: payment.event.title,
      issued: true,
    };
  });

  if (settled.status === "PAID" && settled.issued) {
    await notifyPubkey({
      pubkey: settled.buyerPubkey,
      type: "TICKET_ISSUED",
      title: `Ticket issued: ${settled.eventTitle}`,
      body: "Your payment has been confirmed and your ticket is ready.",
      eventId: settled.eventId,
      ticketId: settled.ticketId ?? undefined,
    }).catch(() => {});
  }

  if (settled.status !== "PAID") return settled;
  return {
    status: "PAID",
    paidAt: settled.paidAt,
    ticketId: settled.ticketId,
    ticketSecret: settled.ticketSecret,
    issued: settled.issued,
  };
}

async function expirePayment(paymentId: string): Promise<PaymentReconcileResult> {
  const updated = await prisma.payment.updateMany({
    where: { id: paymentId, status: "PENDING" },
    data: { status: "EXPIRED" },
  });
  return updated.count > 0 ? { status: "EXPIRED" } : reconcilePayment(paymentId);
}

export async function claimPaymentWithPreimage(paymentId: string, preimage: string): Promise<PaymentReconcileResult> {
  return settlePayment(paymentId, preimage.toLowerCase());
}

export async function reconcilePayment(paymentId: string): Promise<PaymentReconcileResult> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      paymentHash: true,
      status: true,
      provider: true,
      verifyUrl: true,
      expiresAt: true,
    },
  });
  if (!payment) return { status: "NOT_FOUND" };

  if (payment.status === "PAID") return settlePayment(payment.id, null);
  if (payment.status === "EXPIRED") return { status: "EXPIRED" };
  if (payment.status === "FAILED") return { status: "FAILED", warning: "payment already failed" };

  if (payment.expiresAt.getTime() < Date.now()) {
    return expirePayment(payment.id);
  }

  let settled = false;
  let preimage: string | null = null;
  if (payment.provider === "mock") {
    const result = checkMockInvoice(payment.paymentHash);
    settled = result.settled;
    preimage = result.preimage;
  } else if (payment.provider === "lnurl" && payment.verifyUrl) {
    try {
      const result = await verifyInvoice(payment.verifyUrl);
      settled = result.settled;
      preimage = result.preimage;
    } catch {
      return { status: "PENDING" };
    }
  } else {
    return { status: "PENDING", requiresClaim: true };
  }

  if (!settled) return { status: "PENDING" };
  if (preimage && !preimageMatches(payment.paymentHash, preimage)) {
    return { status: "PENDING", warning: "preimage mismatch" };
  }
  return settlePayment(payment.id, preimage);
}

export async function reconcilePendingPayments(limit = 100) {
  const pending = await prisma.payment.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const summary = {
    checked: 0,
    paid: 0,
    expired: 0,
    pending: 0,
    requiresClaim: 0,
    failed: 0,
    missing: 0,
  };
  const results: Array<{ paymentId: string; status: PaymentReconcileResult["status"]; detail?: string }> = [];

  for (const payment of pending) {
    const result = await reconcilePayment(payment.id);
    summary.checked += 1;
    if (result.status === "PAID") summary.paid += 1;
    else if (result.status === "EXPIRED") summary.expired += 1;
    else if (result.status === "PENDING" && result.requiresClaim) summary.requiresClaim += 1;
    else if (result.status === "PENDING") summary.pending += 1;
    else if (result.status === "FAILED") summary.failed += 1;
    else summary.missing += 1;
    results.push({
      paymentId: payment.id,
      status: result.status,
      detail: result.status === "PENDING" && result.requiresClaim ? "requiresClaim" : undefined,
    });
  }

  return { summary, results };
}
