"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ClaimTicketPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id: paymentId } = use(params);
  const router = useRouter();
  const [preimage, setPreimage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const cleaned = preimage.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(cleaned)) {
      setErr("Preimage must be exactly 64 hexadecimal characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/tickets/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, preimage: cleaned }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? "Claim failed");
      const url = json.ticketSecret
        ? `/tickets/${json.ticketId}#secret=${encodeURIComponent(json.ticketSecret)}`
        : `/tickets/${json.ticketId}`;
      router.push(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-5 py-12">
      <Link href="/" className="text-sm text-muted hover:text-fg inline-flex items-center gap-1 mb-3">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        Home
      </Link>

      <div className="rounded-2xl bg-surface border border-border shadow-soft p-6 space-y-4">
        <div>
          <div className="w-10 h-10 rounded-full bg-accentSoft text-accent grid place-items-center mb-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Claim your ticket</h1>
          <p className="text-sm text-muted mt-1.5 leading-relaxed">
            Already paid the invoice but didn't get a ticket? Paste the
            <span className="font-medium text-fg"> preimage</span> from your wallet's payment record. We
            verify it matches the invoice cryptographically — no account required.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium block mb-1.5">Preimage</span>
            <textarea
              value={preimage}
              onChange={(e) => setPreimage(e.target.value)}
              placeholder="64 hexadecimal characters from your wallet's payment details"
              rows={3}
              className="!font-mono !text-xs"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          {err && (
            <div className="rounded-lg bg-dangerSoft border border-danger/20 px-3 py-2 text-xs text-danger">
              {err}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 rounded-full bg-fg text-bg font-medium text-sm hover:bg-fg2 transition disabled:opacity-50 active:scale-[0.98]"
          >
            {busy ? "Verifying…" : "Claim ticket"}
          </button>
        </form>

        <div className="border-t border-border pt-4">
          <details className="text-xs text-muted">
            <summary className="cursor-pointer hover:text-fg">Where do I find my preimage?</summary>
            <div className="mt-2 leading-relaxed space-y-2">
              <p>
                The preimage is the 64-character hex string a wallet records when a Lightning payment
                settles. It's the cryptographic proof that the invoice was paid.
              </p>
              <ul className="space-y-1 list-disc pl-4">
                <li><b>Alby</b> — Settings → Activity → click the payment → "Preimage"</li>
                <li><b>Phoenix</b> — payment details → tap to expand → "Preimage"</li>
                <li><b>Zeus / LND</b> — payment row → expand → "preimage"</li>
                <li><b>Mutiny</b> — Activity → payment → "Preimage"</li>
              </ul>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
