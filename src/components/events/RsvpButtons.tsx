"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNostr } from "@/hooks/useNostr";
import { buildRsvp, eventCoordinate, rsvpDTag } from "@/lib/nostr/event-builder";
import { clientPublish } from "@/lib/nostr/client-pool";
import { hashAuthPayload } from "@/lib/auth-client";
import { RSVP_LABELS, type RsvpStatusString } from "@/lib/nostr/kinds";
import { cn } from "@/lib/utils";

interface Props {
  eventId: string;
  organizerPubkey: string;
  dTag: string;
  capacity?: number | null;
  goingCount?: number;
  initialStatus?: RsvpStatusString | null;
  alreadyOwnedTicketId?: string | null;
  onChange?: (status: RsvpStatusString, ticketId?: string | null) => void;
}

const SECONDARY: RsvpStatusString[] = ["tentative"];

export function RsvpButtons({
  eventId, organizerPubkey, dTag, capacity, goingCount = 0, initialStatus, alreadyOwnedTicketId, onChange,
}: Props) {
  const router = useRouter();
  const { identity, signEvent, login, hasSigner } = useNostr();
  const [status, setStatus] = useState<RsvpStatusString | null>(initialStatus ?? null);
  const [busy, setBusy] = useState<RsvpStatusString | null>(null);
  const [privateMode, setPrivateMode] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleClick(s: RsvpStatusString) {
    setErr(null);
    let currentIdentity = identity;
    if (!currentIdentity) {
      try { currentIdentity = await login(); } catch (e) { setErr((e as Error).message); return; }
    }
    setBusy(s);
    try {
      const coord = eventCoordinate(organizerPubkey, dTag);
      let publishP: Promise<unknown> | null = null;
      let body: unknown;
      if (privateMode) {
        const payload = { eventId, status: s, private: true };
        const signedAuthEvent = await signEvent({
          pubkey: currentIdentity.pubkey,
          kind: 27235,
          created_at: Math.floor(Date.now() / 1000),
          content: "",
          tags: [
            ["action", "rsvp.private"],
            ["event_id", eventId],
            ["status", s],
            ["payload_hash", await hashAuthPayload(payload)],
          ],
        });
        body = { signedAuthEvent, status: s, private: true };
      } else {
        const unsigned = buildRsvp({
          pubkey: currentIdentity.pubkey,
          eventCoordinate: coord,
          organizerPubkey,
          status: s,
          dTag: rsvpDTag(coord),
        });
        const signedEvent = await signEvent(unsigned);
        publishP = clientPublish(signedEvent);
        body = { signedEvent };
      }
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (publishP) await publishP;
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "RSVP failed");
      setStatus(s);
      onChange?.(s, json.ticketId ?? null);
      if (json.ticketId && json.ticketSecret) {
        router.push(`/tickets/${json.ticketId}#secret=${encodeURIComponent(json.ticketSecret)}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const goingActive = status === "accepted";
  const isFull = !!capacity && goingCount >= capacity;

  return (
    <div className="space-y-2">
      {alreadyOwnedTicketId && (
        <Link
          href={`/tickets/${alreadyOwnedTicketId}`}
          className="w-full h-10 inline-flex items-center justify-center rounded-full bg-success text-white text-sm font-medium hover:brightness-110"
        >
          View your ticket
        </Link>
      )}
      <button
        disabled={!!busy || (isFull && !goingActive)}
        onClick={() => handleClick("accepted")}
        className={cn(
          "w-full h-12 rounded-full font-medium text-sm transition-all active:scale-[0.98] focus-ring",
          goingActive
            ? "bg-success text-white hover:brightness-110 shadow-soft"
            : "bg-fg text-bg hover:bg-fg2 shadow-soft",
          busy === "accepted" && "opacity-70"
        )}
      >
        {busy === "accepted" ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
            Signing
          </span>
        ) : goingActive ? "You're going" : isFull ? "Full" : RSVP_LABELS.accepted}
      </button>

      <div className="grid grid-cols-1 gap-2">
        {SECONDARY.map((v) => {
          const active = status === v;
          const loading = busy === v;
          return (
            <button
              key={v}
              disabled={!!busy}
              onClick={() => handleClick(v)}
              className={cn(
                "h-10 rounded-full text-sm font-medium border transition-colors",
                active
                  ? "bg-surface2 border-fg/40 text-fg"
                  : "bg-transparent border-border text-muted hover:text-fg hover:border-subtle",
                loading && "opacity-70"
              )}
            >
              {loading ? "…" : RSVP_LABELS[v]}
            </button>
          );
        })}
      </div>

      <label className="flex items-center justify-center gap-2 text-[11px] text-muted pt-1">
        <input
          type="checkbox"
          checked={privateMode}
          onChange={(e) => setPrivateMode(e.target.checked)}
          className="!h-3.5 !w-3.5 !p-0 accent-accent"
        />
        Keep my RSVP off public relays
      </label>

      {!hasSigner && !identity && (
        <div className="text-[11px] text-muted text-center pt-1">
          Install Alby or nos2x to RSVP with your Nostr key.
        </div>
      )}
      {err && <div className="text-[11px] text-danger pt-1">{err}</div>}
    </div>
  );
}
