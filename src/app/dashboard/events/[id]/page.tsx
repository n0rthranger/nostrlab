import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { shortNpub } from "@/lib/utils";
import { hexToNpub } from "@/lib/nostr/encode";
import { getSessionPubkey } from "@/lib/session";
import { ManageEventActions } from "@/components/events/ManageEventActions";
import { AnnouncementComposer } from "@/components/events/AnnouncementComposer";
import { WaitlistPromoteButton } from "@/components/events/WaitlistPromoteButton";
import { TicketTierManager } from "@/components/tickets/TicketTierManager";
import { TicketRecoveryButton } from "@/components/tickets/TicketRecoveryButton";
import { ticketTierToDTO } from "@/lib/dto";
import { eventDeleteBlockedReason, type EventActivityCounts } from "@/lib/events/delete-policy";

export const dynamic = "force-dynamic";

export default async function ManageEventPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pubkey = await getSessionPubkey();
  if (!pubkey) notFound();

  const access = await prisma.event.findUnique({
    where: { id },
    select: {
      organizerPubkey: true,
      cohosts: { select: { pubkey: true } },
    },
  });
  if (!access) notFound();
  const allowed = access.organizerPubkey === pubkey || access.cohosts.some((c) => c.pubkey === pubkey);
  if (!allowed) notFound();

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      _count: { select: { rsvps: true, tickets: true, checkIns: true, payments: true, comments: true, announcements: true } },
      organizer: true,
      rsvps: { include: { user: true }, orderBy: { updatedAt: "desc" } },
      tickets: { include: { buyer: true, payment: true }, orderBy: { createdAt: "desc" } },
      ticketTiers: { include: { _count: { select: { tickets: true } } }, orderBy: { priceSats: "asc" } },
    },
  });
  if (!event) notFound();
  const paid = await prisma.payment.aggregate({
    where: { eventId: event.id, status: "PAID" },
    _sum: { amountSats: true },
    _count: { _all: true },
  });
  const paymentSummary = await prisma.payment.groupBy({
    by: ["status"],
    where: { eventId: event.id },
    _sum: { amountSats: true },
    _count: { _all: true },
  });
  const paymentByStatus = new Map(paymentSummary.map((p) => [p.status, p]));
  const deleteCounts: EventActivityCounts = {
    rsvps: event._count.rsvps,
    tickets: event._count.tickets,
    payments: event._count.payments,
    checkIns: event._count.checkIns,
    comments: event._count.comments,
    announcements: event._count.announcements,
  };
  const deleteBlockedReason = eventDeleteBlockedReason(deleteCounts);

  const day = event.startsAt.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
  const time = event.startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div className="max-w-5xl mx-auto px-5 py-10 space-y-10">
      <header>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <Link href="/dashboard" className="text-sm text-muted hover:text-fg inline-flex items-center gap-1 mb-3">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              Dashboard
            </Link>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.025em] leading-tight">
              {event.title}
            </h1>
            <div className="text-sm text-muted mt-1">
              {day} · {time}
              {event.city && ` · ${event.city}`}
              {event.venue && ` · ${event.venue}`}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <Link href={`/events/${event.id}`}
              className="h-10 px-4 inline-flex items-center rounded-full border border-border text-sm font-medium hover:bg-surface2 transition-colors">
              View public
            </Link>
            <a href={`/api/events/${event.id}/attendees.csv`}
              className="h-10 px-4 inline-flex items-center rounded-full border border-border text-sm font-medium hover:bg-surface2 transition-colors">
              Export CSV
            </a>
            <Link href={`/dashboard/events/${event.id}/check-in`}
              className="h-10 px-4 inline-flex items-center rounded-full bg-fg text-bg text-sm font-medium hover:bg-fg2 shadow-soft transition active:scale-[0.98]">
              Check-in
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          <Stat label="RSVPs" value={event._count.rsvps} />
          <Stat label="Tickets" value={event._count.tickets} />
          <Stat label="Checked in" value={event._count.checkIns} />
          <Stat
            label="Sats collected"
            value={(paid._sum.amountSats ?? 0).toLocaleString()}
            hint={`${paid._count._all} payments`}
          />
        </div>
      </header>

      <ManageEventActions
        eventId={event.id}
        organizerPubkey={event.organizerPubkey}
        dTag={event.dTag}
        nostrId={event.nostrId}
        status={event.status}
        canDelete={pubkey === event.organizerPubkey && !deleteBlockedReason}
        deleteBlockedReason={deleteBlockedReason}
      />

      {event.paymentMode === "PAID" && (
        <section className="rounded-2xl bg-surface border border-border shadow-soft p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Payout status</h2>
              <p className="text-sm text-muted mt-1">
                Payments settle directly to the organizer Lightning Address. NostrLab does not hold funds or process refunds.
              </p>
            </div>
            <Badge tone={event.organizer.lud16 ? "success" : "danger"} size="sm">
              {event.organizer.lud16 ? "Lightning address set" : "No Lightning address"}
            </Badge>
          </div>
          <div className="mt-4 grid sm:grid-cols-4 gap-3">
            <MiniStat label="Paid" value={(paymentByStatus.get("PAID")?._sum.amountSats ?? 0).toLocaleString()} hint={`${paymentByStatus.get("PAID")?._count._all ?? 0} payments`} />
            <MiniStat label="Pending" value={(paymentByStatus.get("PENDING")?._sum.amountSats ?? 0).toLocaleString()} hint={`${paymentByStatus.get("PENDING")?._count._all ?? 0} invoices`} />
            <MiniStat label="Expired" value={paymentByStatus.get("EXPIRED")?._count._all ?? 0} />
            <MiniStat label="Failed" value={paymentByStatus.get("FAILED")?._count._all ?? 0} />
          </div>
          <div className="mt-4 rounded-xl bg-surface2 border border-border px-4 py-3 text-sm text-muted">
            {event.organizer.lud16 ? (
              <>Receiving wallet: <span className="font-mono text-fg">{event.organizer.lud16}</span>. Refunds are direct payments from this wallet to the attendee outside NostrLab.</>
            ) : (
              <>Paid ticket checkout is blocked until the organizer adds a <code className="font-mono">lud16</code> Lightning Address to their Nostr profile and refreshes it.</>
            )}
          </div>
        </section>
      )}

      {event.paymentMode === "PAID" && (
        <TicketTierManager
          eventId={event.id}
          initialTiers={event.ticketTiers.map(ticketTierToDTO)}
          fallbackPriceSats={event.priceSats}
        />
      )}

      <AnnouncementComposer
        eventId={event.id}
        organizerPubkey={event.organizerPubkey}
        dTag={event.dTag}
        nostrId={event.nostrId}
      />

      <section>
        <h2 className="text-xl font-semibold tracking-tight mb-3">RSVPs</h2>
        {event.rsvps.length === 0 ? (
          <div className="rounded-xl bg-surface border border-border p-8 text-center text-sm text-muted">
            No RSVPs yet.
          </div>
        ) : (
          <div className="rounded-xl bg-surface border border-border overflow-hidden">
            <ul className="divide-y divide-border">
              {event.rsvps.map((r) => (
                <li key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar src={r.user.picture} size={28} seed={r.pubkey} alt={r.user.npub} />
                    <span className="font-medium text-sm truncate">
                      {r.user.displayName ?? r.user.name ?? shortNpub(hexToNpub(r.pubkey))}
                    </span>
                  </div>
                  <Badge tone={r.status === "GOING" ? "success" : r.status === "MAYBE" ? "accent" : "muted"} size="sm">
                    {r.status.toLowerCase().replace("_", " ")}
                  </Badge>
                  {r.privatePayload && <Badge tone="muted" size="sm">private</Badge>}
                  {r.status === "WAITLIST" && event.paymentMode === "FREE" && (
                    <WaitlistPromoteButton eventId={event.id} pubkey={r.pubkey} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight mb-3">Tickets</h2>
          {event.tickets.length === 0 ? (
            <div className="rounded-xl bg-surface border border-border p-8 text-center text-sm text-muted">
              No tickets issued yet.
            </div>
          ) : (
            <div className="rounded-xl bg-surface border border-border overflow-hidden">
              <ul className="divide-y divide-border">
                {event.tickets.map((t) => (
                  <li key={t.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar src={t.buyer.picture} size={28} seed={t.buyerPubkey} alt={t.buyer.npub} />
                      <span className="font-medium text-sm truncate">
                        {t.buyer.displayName ?? t.buyer.name ?? shortNpub(hexToNpub(t.buyerPubkey))}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted">
                        {t.payment ? `${t.payment.amountSats.toLocaleString()} sats` : ""}
                      </span>
                      {t.checkedInAt
                        ? <Badge tone="success" size="sm">checked in</Badge>
                        : <Badge tone="muted" size="sm">issued</Badge>}
                      <TicketRecoveryButton ticketId={t.id} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-semibold mt-1 leading-none tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted mt-1">{hint}</div>}
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold mt-1 tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
    </div>
  );
}
