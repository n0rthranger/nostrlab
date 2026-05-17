"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useNostr } from "@/hooks/useNostr";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { hashAuthPayload } from "@/lib/auth-client";

interface BannedRow {
  pubkey: string;
  reason: string | null;
  bannedAt: string;
}

export default function AdminPage() {
  const { identity, login, signEvent, hasSigner } = useNostr();
  const [list, setList] = useState<BannedRow[] | null>(null);
  const [adminPubkey, setAdminPubkey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Inputs
  const [pubkeyInput, setPubkeyInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");

  useEffect(() => {
    fetch("/api/admin/who")
      .then((r) => r.json())
      .then((j) => setAdminPubkey(j.adminPubkey ?? null))
      .catch(() => {});
    refresh();
  }, []);

  async function refresh() {
    fetch("/api/admin/banned")
      .then((r) => r.json())
      .then((j) => setList(j.list ?? []))
      .catch(() => setList([]));
  }

  const isAdmin = identity && adminPubkey && identity.pubkey.toLowerCase() === adminPubkey.toLowerCase();

  async function ban() {
    setErr(null);
    if (!identity) {
      try { await login(); } catch (e) { setErr((e as Error).message); return; }
    }
    if (!identity) return;
    setBusy(true);
    try {
      const cleaned = pubkeyInput.trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(cleaned)) throw new Error("Pubkey must be 64 hex chars");
      const payload = {
        pubkey: cleaned,
        reason: reasonInput.trim() || null,
      };
      const payloadHash = await hashAuthPayload(payload);
      const signed = await signEvent({
        pubkey: identity.pubkey,
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        content: "",
        tags: [
          ["action", "moderation.ban"],
          ["p", cleaned],
          ["payload_hash", payloadHash],
        ],
      });
      const res = await fetch("/api/admin/ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signedAuthEvent: signed,
          ...payload,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error?.message ?? `HTTP ${res.status}`);
      setPubkeyInput("");
      setReasonInput("");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function unban(pubkey: string) {
    if (!identity) return;
    setBusy(true);
    try {
      const payload = { pubkey, reason: null };
      const payloadHash = await hashAuthPayload(payload);
      const signed = await signEvent({
        pubkey: identity.pubkey,
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        content: "",
        tags: [
          ["action", "moderation.unban"],
          ["p", pubkey],
          ["payload_hash", payloadHash],
        ],
      });
      await fetch("/api/admin/ban", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedAuthEvent: signed, ...payload }),
      });
      await refresh();
    } catch { /* ignore */ }
    finally { setBusy(false); }
  }

  if (!adminPubkey) {
    return (
      <div className="max-w-md mx-auto px-5 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Admin disabled</h1>
        <p className="text-muted mt-2 text-sm">
          Set <code className="font-mono">NOSTRLAB_ADMIN_PUBKEY</code> in <code className="font-mono">.env</code> (an npub or hex pubkey) to enable moderation.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm text-accent hover:underline">← Home</Link>
      </div>
    );
  }

  if (!identity) {
    return (
      <div className="max-w-md mx-auto px-5 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to moderate</h1>
        <p className="text-muted mt-2 text-sm">Admin: {adminPubkey.slice(0, 16)}…</p>
        <div className="mt-6">
          <Button size="lg" onClick={() => login().catch(() => {})} disabled={!hasSigner}>
            Sign in with Nostr
          </Button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto px-5 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Not authorized</h1>
        <p className="text-muted mt-2 text-sm">
          Your npub doesn't match the admin pubkey configured in this server.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm text-accent hover:underline">← Home</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-5 py-10 space-y-8">
      <header>
        <div className="text-xs font-medium text-accent">Admin</div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.025em] mt-1">Moderation</h1>
        <p className="text-muted text-sm mt-2 max-w-prose leading-relaxed">
          Banned pubkeys can't publish events or RSVPs through NostrLab, and their existing events are hidden from feeds. They remain on the underlying Nostr relays — other clients can still see them. We are a selective indexer, not a censor.
        </p>
      </header>

      <section className="rounded-2xl bg-surface border border-border shadow-soft p-5 space-y-3">
        <div className="font-medium">Ban a pubkey</div>
        <input
          value={pubkeyInput}
          onChange={(e) => setPubkeyInput(e.target.value)}
          placeholder="hex pubkey (64 chars)"
          className="!font-mono !text-xs"
          spellCheck={false}
        />
        <input
          value={reasonInput}
          onChange={(e) => setReasonInput(e.target.value)}
          placeholder="Reason (optional, internal note)"
        />
        <div className="flex justify-end">
          <Button onClick={ban} loading={busy} disabled={busy || !pubkeyInput}>Ban</Button>
        </div>
        {err && <div className="text-xs text-danger">{err}</div>}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-3">Banned pubkeys</h2>
        {list === null ? (
          <div className="text-sm text-muted">Loading…</div>
        ) : list.length === 0 ? (
          <Empty title="No banned pubkeys" />
        ) : (
          <div className="rounded-xl bg-surface border border-border overflow-hidden">
            <ul className="divide-y divide-border">
              {list.map((b) => (
                <li key={b.pubkey} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs truncate">{b.pubkey}</div>
                    {b.reason && <div className="text-xs text-muted mt-0.5 truncate">{b.reason}</div>}
                    <div className="text-[11px] text-muted mt-0.5">
                      banned {new Date(b.bannedAt).toLocaleString()}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => unban(b.pubkey)} disabled={busy}>
                    Unban
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
