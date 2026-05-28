import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPubkey } from "@/lib/session";
import { isAdmin, isAdminConfigured } from "@/lib/moderation";
import { ensureRelayListener, listenerStats } from "@/lib/nostr/relay-listener";
import { relayPoolStats } from "@/lib/nostr/relay-pool";
import { paymentReconcilerStats } from "@/lib/payments/reconcile-worker";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdminConfigured()) return NextResponse.json({ error: "admin disabled" }, { status: 503 });
  const pubkey = await getSessionPubkey();
  if (!pubkey || !isAdmin(pubkey)) return NextResponse.json({ error: "not admin" }, { status: 403 });
  await ensureRelayListener();
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [
    users,
    activeEvents,
    upcomingEvents,
    communities,
    pendingPosts,
    pendingPayments,
    paidPayments24h,
    issuedTickets24h,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.event.count({ where: { status: "ACTIVE", duplicateOfId: null } }),
    prisma.event.count({ where: { status: "ACTIVE", startsAt: { gte: now }, duplicateOfId: null } }),
    prisma.community.count(),
    prisma.communityPost.count({ where: { approvedAt: null } }),
    prisma.payment.count({ where: { status: "PENDING", expiresAt: { gt: now } } }),
    prisma.payment.count({ where: { status: "PAID", paidAt: { gte: since24h } } }),
    prisma.ticket.count({ where: { createdAt: { gte: since24h } } }),
  ]);
  return NextResponse.json({
    ts: now.toISOString(),
    counters: {
      users,
      activeEvents,
      upcomingEvents,
      communities,
      pendingPosts,
      pendingPayments,
      paidPayments24h,
      issuedTickets24h,
    },
    relayListener: listenerStats(),
    relayPublisher: relayPoolStats(),
    paymentReconciler: paymentReconcilerStats(),
  });
}
