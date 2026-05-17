"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useNostr } from "@/hooks/useNostr";
import { hashAuthPayload } from "@/lib/auth-client";
import type { TicketTierDTO } from "@/types";

interface DraftTier {
  id?: string;
  name: string;
  description: string;
  priceSats: string;
  quantity: string;
}

function fromDTO(t: TicketTierDTO): DraftTier {
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? "",
    priceSats: String(t.priceSats),
    quantity: t.quantity ? String(t.quantity) : "",
  };
}

export function TicketTierManager({
  eventId,
  initialTiers,
  fallbackPriceSats,
}: {
  eventId: string;
  initialTiers: TicketTierDTO[];
  fallbackPriceSats: number | null;
}) {
  const { identity, login, signEvent } = useNostr();
  const [tiers, setTiers] = useState<DraftTier[]>(
    initialTiers.length > 0
      ? initialTiers.map(fromDTO)
      : fallbackPriceSats
      ? [{ name: "General", description: "", priceSats: String(fallbackPriceSats), quantity: "" }]
      : []
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update(index: number, patch: Partial<DraftTier>) {
    setTiers((current) => current.map((t, i) => i === index ? { ...t, ...patch } : t));
  }

  async function save() {
    setErr(null);
    setSaved(false);
    let currentIdentity = identity;
    if (!currentIdentity) {
      try { currentIdentity = await login(); } catch (e) { setErr((e as Error).message); return; }
    }
    const normalized = tiers
      .map((t) => ({
        id: t.id,
        name: t.name.trim(),
        description: t.description.trim() || null,
        priceSats: Number(t.priceSats),
        quantity: t.quantity ? Number(t.quantity) : null,
        salesStartAt: null,
        salesEndAt: null,
      }))
      .filter((t) => t.name && Number.isFinite(t.priceSats) && t.priceSats > 0);
    setBusy(true);
    try {
      const payload = { eventId, tiers: normalized };
      const payloadHash = await hashAuthPayload(payload);
      const signed = await signEvent({
        pubkey: currentIdentity.pubkey,
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        content: "",
        tags: [
          ["action", "ticket-tiers.update"],
          ["e", eventId],
          ["payload_hash", payloadHash],
        ],
      });
      const res = await fetch(`/api/events/${eventId}/ticket-tiers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tiers: normalized, signedAuthEvent: signed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save tiers.");
      setTiers((json.tiers ?? []).map(fromDTO));
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-surface border border-border shadow-soft p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Ticket tiers</h2>
          <p className="text-sm text-muted mt-1">Create multiple paid entry options and optional quantity limits.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTiers((current) => [...current, { name: "", description: "", priceSats: "", quantity: "" }])}
        >
          Add tier
        </Button>
      </div>
      {tiers.length === 0 ? (
        <div className="text-sm text-muted">No paid tiers for this event.</div>
      ) : (
        <div className="space-y-3">
          {tiers.map((tier, index) => (
            <div key={tier.id ?? index} className="grid gap-2 md:grid-cols-[1fr_120px_120px_auto]">
              <input value={tier.name} onChange={(e) => update(index, { name: e.target.value })} placeholder="Tier name" />
              <input type="number" min="1" value={tier.priceSats} onChange={(e) => update(index, { priceSats: e.target.value })} placeholder="sats" />
              <input type="number" min="1" value={tier.quantity} onChange={(e) => update(index, { quantity: e.target.value })} placeholder="limit" />
              <button
                type="button"
                onClick={() => setTiers((current) => current.filter((_, i) => i !== index))}
                className="h-10 px-3 rounded-lg border border-border text-sm text-muted hover:text-danger"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs">
          {err && <span className="text-danger">{err}</span>}
          {saved && <span className="text-success">Saved.</span>}
        </div>
        <Button onClick={save} loading={busy} disabled={busy || tiers.length === 0}>Save tiers</Button>
      </div>
    </section>
  );
}
