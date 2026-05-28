"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useNostr } from "@/hooks/useNostr";
import { RsvpButtons } from "./RsvpButtons";
import { BuyTicketButton } from "@/components/tickets/BuyTicketButton";
import type { RsvpStatusString } from "@/lib/nostr/kinds";
import type { TicketTierDTO } from "@/types";

interface Props {
  eventId: string;
  organizerPubkey: string;
  dTag: string;
  paymentMode: "FREE" | "PAID";
  priceSats: number | null;
  status: "ACTIVE" | "CANCELLED";
  capacity: number | null;
  goingCount: number;
  ticketTiers: TicketTierDTO[];
  shareUrl: string;
}

interface MyState {
  rsvp?: { status: RsvpStatusString } | null;
  ticket?: { id: string } | null;
}

export function EventDetailClient({
  eventId, organizerPubkey, dTag, paymentMode, priceSats, status, capacity, goingCount, ticketTiers, shareUrl,
}: Props) {
  const { identity } = useNostr();
  const [me, setMe] = useState<MyState>({});
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (!identity) { setMe({}); return; }
    fetch(`/api/events/${eventId}/me?pubkey=${identity.pubkey}`)
      .then((r) => (r.ok ? r.json() : { rsvp: null, ticket: null }))
      .then(setMe)
      .catch(() => {});
  }, [eventId, identity]);

  return (
    <div className="rounded-2xl bg-surface border border-border shadow-soft overflow-hidden">
      <div className="p-5 space-y-4">
        {status === "CANCELLED" ? (
          <div>
            <div className="text-xs text-muted">Admission</div>
            <div className="text-xl font-semibold mt-0.5 text-danger">Cancelled</div>
          </div>
        ) : paymentMode === "PAID" ? (
          <>
            <div>
              <div className="text-xs text-muted">Admission</div>
              <div className="text-2xl font-semibold mt-0.5">
                {(priceSats ?? 0).toLocaleString()}
                <span className="text-base text-muted ml-1.5">sats</span>
              </div>
            </div>
            <BuyTicketButton
              eventId={eventId}
              priceSats={priceSats ?? 0}
              ticketTiers={ticketTiers}
              alreadyOwnedTicketId={me.ticket?.id ?? null}
            />
          </>
        ) : (
          <>
            <div>
              <div className="text-xs text-muted">Admission</div>
              <div className="text-2xl font-semibold mt-0.5">Free</div>
            </div>
            <RsvpButtons
              eventId={eventId}
              organizerPubkey={organizerPubkey}
              dTag={dTag}
              capacity={capacity}
              goingCount={goingCount}
              initialStatus={me.rsvp?.status}
              alreadyOwnedTicketId={me.ticket?.id ?? null}
              onChange={(nextStatus, ticketId) => setMe((s) => ({
                ...s,
                rsvp: { status: nextStatus },
                ticket: ticketId ? { id: ticketId } : s.ticket,
              }))}
            />
          </>
        )}
      </div>

      <div className="border-t border-border px-5 py-3 flex items-center justify-between text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-12V5l-8-3-8 3v5c0 8 8 12 8 12z"/></svg>
          Signed by Nostr key
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="!h-7 !px-2.5"
          onClick={async () => {
            const url = `${window.location.origin}${shareUrl}`;
            try {
              if (navigator.share) await navigator.share({ url });
              else {
                await navigator.clipboard.writeText(url);
                setShared(true);
                setTimeout(() => setShared(false), 1500);
              }
            } catch { /* user cancelled */ }
          }}
        >
          {shared ? "Copied" : "Share"}
        </Button>
      </div>
    </div>
  );
}
