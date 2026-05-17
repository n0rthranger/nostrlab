import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/Badge";
import { shortNpub } from "@/lib/utils";
import { hexToNpub } from "@/lib/nostr/encode";
import { eventGradient } from "@/lib/gradient";
import { TicketSecretPanel } from "@/components/tickets/TicketSecretPanel";
import { TicketTransferPanel } from "@/components/tickets/TicketTransferPanel";
import { getSessionPubkey } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function TicketPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ secret?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (sp.secret) {
    redirect(`/tickets/${id}#secret=${encodeURIComponent(sp.secret)}`);
  }
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { event: true },
  });
  if (!ticket) notFound();
  const sessionPubkey = await getSessionPubkey();
  const canTransfer = sessionPubkey === ticket.buyerPubkey && !ticket.checkedInAt;

  const start = ticket.event.startsAt;
  const day = start.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const time = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const grad = eventGradient(ticket.event.id);

  return (
    <div className="max-w-md mx-auto px-5 py-12">
      <div className="rounded-3xl bg-surface border border-border shadow-lg overflow-hidden">
        {/* Gradient header */}
        <div
          className="h-32 relative"
          style={{ backgroundImage: ticket.event.bannerUrl ? `url(${ticket.event.bannerUrl})` : grad.cssLight, backgroundSize: "cover", backgroundPosition: "center" }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
          <div className="absolute top-4 right-4">
            {ticket.checkedInAt
              ? <Badge tone="success" className="bg-bg/90 backdrop-blur shadow-soft">Checked in</Badge>
              : <Badge tone="default" className="bg-bg/90 backdrop-blur shadow-soft">Awaiting</Badge>}
          </div>
        </div>

        <div className="px-6 pt-5 pb-6">
          <div className="text-xs text-muted">{day}</div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1 leading-tight">
            {ticket.event.title}
          </h1>
          <div className="text-sm text-muted mt-1">
            {time}
            {ticket.event.venue && ` · ${ticket.event.venue}`}
            {ticket.event.city && ` · ${ticket.event.city}`}
          </div>

          <div className="mt-6 mx-auto max-w-[280px]">
            <TicketSecretPanel ticketId={ticket.id} />
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <Row label="Tier">{ticket.tier}</Row>
            <Row label="Holder">{shortNpub(hexToNpub(ticket.buyerPubkey))}</Row>
          </dl>

          <div className="mt-6 pt-5 border-t border-border flex items-center justify-between">
            <Link href={`/events/${ticket.event.id}`} className="text-sm text-muted hover:text-fg">
              ← Back to event
            </Link>
            <div className="text-[11px] text-subtle font-mono">№ {ticket.id.slice(-6).toUpperCase()}</div>
          </div>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-subtle text-center">
        Single-use · Secret stays in the URL · No payment data on Nostr
      </div>
      {canTransfer && <TicketTransferPanel ticketId={ticket.id} />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium mt-0.5 truncate">{children}</dd>
    </div>
  );
}
