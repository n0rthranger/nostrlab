"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useNostr } from "@/hooks/useNostr";
import { hashAuthPayload } from "@/lib/auth-client";

export function TicketTransferPanel({ ticketId }: { ticketId: string }) {
  const { identity, login, signEvent } = useNostr();
  const [recipientPubkey, setRecipientPubkey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function transfer(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setDone(false);
    let currentIdentity = identity;
    if (!currentIdentity) {
      try { currentIdentity = await login(); } catch (er) { setErr((er as Error).message); return; }
    }
    const payload = { ticketId, recipientPubkey: recipientPubkey.trim() };
    setBusy(true);
    try {
      const payloadHash = await hashAuthPayload(payload);
      const signed = await signEvent({
        pubkey: currentIdentity.pubkey,
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        content: "",
        tags: [
          ["action", "ticket.transfer"],
          ["t", ticketId],
          ["payload_hash", payloadHash],
        ],
      });
      const res = await fetch(`/api/tickets/${ticketId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientPubkey: payload.recipientPubkey, signedAuthEvent: signed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Transfer failed.");
      setRecipientPubkey("");
      setDone(true);
    } catch (er) {
      setErr(er instanceof Error ? er.message : String(er));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={transfer} className="mt-4 rounded-2xl bg-surface border border-border p-4 space-y-3">
      <div>
        <div className="font-medium text-sm">Transfer ticket</div>
        <div className="text-xs text-muted mt-1">Send this ticket to another npub or hex pubkey before check-in.</div>
      </div>
      <input value={recipientPubkey} onChange={(e) => setRecipientPubkey(e.target.value)} placeholder="Recipient npub or hex pubkey" />
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs">
          {err && <span className="text-danger">{err}</span>}
          {done && <span className="text-success">Transferred.</span>}
        </div>
        <Button type="submit" size="sm" loading={busy} disabled={busy || !recipientPubkey.trim()}>Transfer</Button>
      </div>
    </form>
  );
}
