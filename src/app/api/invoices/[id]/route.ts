import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPubkey } from "@/lib/session";
import { reconcilePayment } from "@/lib/payments/reconcile";

export const dynamic = "force-dynamic";

/**
 * GET /api/invoices/[id]
 * Polled by the buyer's modal until the invoice settles.
 * On settle: verify the preimage cryptographically, mark paid, and
 * issue a Ticket — all in one transaction.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      event: { select: { id: true, title: true, priceSats: true } },
      tier: true,
    },
  });
  if (!payment) return NextResponse.json({ error: "not found" }, { status: 404 });
  const sessionPubkey = await getSessionPubkey();
  if (!sessionPubkey || sessionPubkey !== payment.buyerPubkey.toLowerCase()) {
    return NextResponse.json({ error: "buyer session required" }, { status: 401 });
  }

  const result = await reconcilePayment(payment.id);
  if (result.status === "NOT_FOUND") return NextResponse.json({ error: "not found" }, { status: 404 });
  if (result.status === "FAILED") return NextResponse.json({ status: "PENDING", warning: result.warning });
  if (result.status === "PAID") {
    return NextResponse.json({
      status: "PAID",
      paidAt: result.paidAt,
      ticketId: result.ticketId,
      ticketSecret: result.ticketSecret,
    });
  }
  return NextResponse.json(result);
}
