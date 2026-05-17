"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNostr } from "@/hooks/useNostr";
import { TicketInvoiceModal } from "./TicketInvoiceModal";
import type { TicketTierDTO } from "@/types";

interface Props {
  eventId: string;
  priceSats: number;
  ticketTiers?: TicketTierDTO[];
  alreadyOwnedTicketId: string | null;
}

export function BuyTicketButton({ eventId, priceSats, ticketTiers = [], alreadyOwnedTicketId }: Props) {
  const router = useRouter();
  const { identity, login, hasSigner } = useNostr();
  const [open, setOpen] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [bolt11, setBolt11] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [errCode, setErrCode] = useState<string | null>(null);
  const [ownedTicketId, setOwnedTicketId] = useState<string | null>(alreadyOwnedTicketId);
  const [tierId, setTierId] = useState(ticketTiers[0]?.id ?? "");
  const selectedTier = ticketTiers.find((t) => t.id === tierId);
  const displayPrice = selectedTier?.priceSats ?? priceSats;

  useEffect(() => setOwnedTicketId(alreadyOwnedTicketId), [alreadyOwnedTicketId]);

  if (ownedTicketId) {
    return (
      <Link
        href={`/tickets/${ownedTicketId}`}
        className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-full bg-success text-white font-medium text-sm hover:brightness-110 shadow-soft transition active:scale-[0.98]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        View your ticket
      </Link>
    );
  }

  async function buy() {
    setErr(null); setErrCode(null);
    let currentIdentity = identity;
    if (!currentIdentity) {
      try { currentIdentity = await login(); } catch (e) { setErr((e as Error).message); return; }
    }
    setBusy(true);
    try {
      let res = await fetch("/api/invoices", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, buyerPubkey: currentIdentity.pubkey, tierId: tierId || undefined }),
      });
      if (res.status === 401) {
        currentIdentity = await login();
        res = await fetch("/api/invoices", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, buyerPubkey: currentIdentity.pubkey, tierId: tierId || undefined }),
        });
      }
      const json = await res.json();
      if (res.status === 409 && json.alreadyOwnsTicketId) {
        setOwnedTicketId(json.alreadyOwnsTicketId);
        return;
      }
      if (!res.ok) {
        setErrCode(json.error ?? null);
        throw new Error(json.message ?? json.error?.formErrors?.join(", ") ?? "Couldn't create invoice");
      }
      setPaymentId(json.paymentId);
      setBolt11(json.bolt11);
      setExpiresAt(new Date(json.expiresAt));
      setIsMock(!!json.mock);
      setOpen(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {ticketTiers.length > 0 && (
        <label className="block">
          <span className="text-xs text-muted block mb-1.5">Ticket tier</span>
          <select
            value={tierId}
            onChange={(e) => setTierId(e.target.value)}
            className="w-full h-10 rounded-lg border border-border bg-surface px-3 text-sm"
          >
            {ticketTiers.map((tier) => {
              const sold = tier.soldCount ?? 0;
              const remaining = tier.quantity ? Math.max(0, tier.quantity - sold) : null;
              const soldOut = remaining === 0;
              return (
                <option key={tier.id} value={tier.id} disabled={soldOut}>
                  {tier.name} · {tier.priceSats.toLocaleString()} sats{remaining !== null ? ` · ${remaining} left` : ""}
                </option>
              );
            })}
          </select>
        </label>
      )}
      <button
        onClick={buy}
        disabled={busy}
        className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-full bg-fg text-bg font-medium text-sm hover:bg-fg2 shadow-soft transition active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? (
          <>
            <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
            Drafting invoice
          </>
        ) : (
          <>Buy ticket · {displayPrice.toLocaleString()} sats</>
        )}
      </button>
      {!hasSigner && !identity && (
        <div className="text-[11px] text-muted text-center">
          Install Alby or nos2x to buy with Nostr.
        </div>
      )}
      {err && (
        <div className="rounded-lg bg-dangerSoft border border-danger/20 px-3 py-2 text-xs text-danger">
          <div>{err}</div>
          {errCode === "PAYOUT_NOT_CONFIGURED" && (
            <div className="mt-1.5 text-fg2">
              Tip: the organizer needs a Lightning Address. They can set one up at{" "}
              <a className="underline" target="_blank" rel="noreferrer" href="https://getalby.com">getalby.com</a>{" "}
              or{" "}
              <a className="underline" target="_blank" rel="noreferrer" href="https://coinos.io">coinos.io</a>.
            </div>
          )}
        </div>
      )}
      {open && bolt11 && paymentId && expiresAt && (
        <TicketInvoiceModal
          paymentId={paymentId}
          bolt11={bolt11}
          expiresAt={expiresAt}
          isMock={isMock}
          onClose={() => setOpen(false)}
          onPaid={(ticketId, ticketSecret) => {
            setOpen(false);
            setOwnedTicketId(ticketId);
            const url = ticketSecret
              ? `/tickets/${ticketId}#secret=${encodeURIComponent(ticketSecret)}`
              : `/tickets/${ticketId}`;
            router.push(url);
          }}
        />
      )}
    </div>
  );
}
