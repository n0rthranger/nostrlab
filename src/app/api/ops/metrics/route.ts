import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listenerStats } from "@/lib/nostr/relay-listener";
import { relayPoolStats } from "@/lib/nostr/relay-pool";
import { paymentReconcilerStats } from "@/lib/payments/reconcile-worker";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const token = process.env.NOSTRLAB_METRICS_TOKEN;
  if (!token) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${token}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [
    users,
    activeEvents,
    upcomingEvents,
    communities,
    pendingPayments,
    paidPayments24h,
    issuedTickets24h,
    checkIns24h,
    unreadNotifications,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.event.count({ where: { status: "ACTIVE", duplicateOfId: null } }),
    prisma.event.count({ where: { status: "ACTIVE", startsAt: { gte: now }, duplicateOfId: null } }),
    prisma.community.count(),
    prisma.payment.count({ where: { status: "PENDING", expiresAt: { gt: now } } }),
    prisma.payment.count({ where: { status: "PAID", paidAt: { gte: since24h } } }),
    prisma.ticket.count({ where: { createdAt: { gte: since24h } } }),
    prisma.checkIn.count({ where: { scannedAt: { gte: since24h } } }),
    prisma.notification.count({ where: { readAt: null } }),
  ]);

  return NextResponse.json(
    {
      service: "nostrlab",
      release: process.env.NOSTRLAB_RELEASE ?? null,
      runtimeRole: process.env.NOSTRLAB_RUNTIME_ROLE ?? null,
      ts: now.toISOString(),
      counters: {
        users,
        activeEvents,
        upcomingEvents,
        communities,
        pendingPayments,
        paidPayments24h,
        issuedTickets24h,
        checkIns24h,
        unreadNotifications,
      },
      relayListener: listenerStats(),
      relayPublisher: relayPoolStats(),
      paymentReconciler: paymentReconcilerStats(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
