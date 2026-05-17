"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Props {
  paymentId: string;
  bolt11: string;
  expiresAt: Date;
  isMock?: boolean;
  onClose: () => void;
  onPaid: (ticketId: string, ticketSecret: string | null) => void;
}

export function TicketInvoiceModal({
  paymentId, bolt11, expiresAt, isMock, onClose, onPaid,
}: Props) {
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<"PENDING" | "PAID" | "EXPIRED">("PENDING");
  const [requiresClaim, setRequiresClaim] = useState(false);
  const [copied, setCopied] = useState(false);
  const stoppedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then(({ default: QRCode }) =>
      QRCode.toDataURL(`lightning:${bolt11}`, {
        errorCorrectionLevel: "M", margin: 1, width: 360,
      })
    ).then((url) => { if (!cancelled) setQr(url); });
    return () => { cancelled = true; };
  }, [bolt11]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (stoppedRef.current) return;
      try {
        const res = await fetch(`/api/invoices/${paymentId}`, { cache: "no-store" });
        const json = await res.json();
        if (json.status === "PAID" && json.ticketId) {
          setStatus("PAID");
          onPaid(json.ticketId, json.ticketSecret ?? null);
          return;
        }
        if (json.status === "EXPIRED") { setStatus("EXPIRED"); return; }
        if (json.requiresClaim) setRequiresClaim(true);
      } catch { /* network blip — keep polling */ }
      timer = setTimeout(tick, 2500);
    }
    tick();
    return () => { stoppedRef.current = true; clearTimeout(timer); };
  }, [paymentId, onPaid]);

  const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-fg/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-elev rounded-3xl border border-border shadow-lg overflow-hidden animate-rise">
        <div className="px-6 pt-5 pb-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted">
              {isMock ? "Mock invoice (testing)" : "Lightning invoice"}
            </div>
            <div className="font-semibold text-base">
              {isMock ? "Auto-settles in seconds" : "Pay to confirm ticket"}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full grid place-items-center text-muted hover:bg-surface2 hover:text-fg transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {status === "EXPIRED" ? (
          <div className="px-6 pb-6 text-center">
            <div className="text-base font-medium">Invoice expired</div>
            <div className="text-muted text-sm mt-1">Close this and try again.</div>
          </div>
        ) : (
          <div className="px-6 pb-6 space-y-4">
            {!isMock && (
              <div className="rounded-2xl bg-white p-4 grid place-items-center">
                {qr ? (
                  <img src={qr} alt="Lightning invoice QR" className="w-full max-w-[280px]" />
                ) : (
                  <div className="aspect-square w-[280px] grid place-items-center">
                    <div className="skeleton w-full h-full rounded-xl" />
                  </div>
                )}
              </div>
            )}

            {isMock && (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center">
                <div className="text-sm text-muted">
                  This is a simulated invoice — no real payment is needed.
                  <br />
                  Will auto-settle in a few seconds.
                </div>
              </div>
            )}

            <div className="text-center text-sm">
              {status === "PAID" ? (
                <span className="text-success font-medium">Confirmed — issuing ticket…</span>
              ) : (
                <span className="text-muted">
                  Expires in <span className="text-fg font-medium tabular-nums">{min}:{String(sec).padStart(2, "0")}</span>
                </span>
              )}
            </div>

            {!isMock && (
              <div className="flex items-center gap-2">
                <input readOnly value={bolt11} className="!font-mono !text-xs flex-1 truncate" />
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(bolt11);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="h-10 px-4 rounded-lg border border-border hover:bg-surface2 transition-colors text-sm font-medium"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}

            {!isMock && (
              <a
                href={`lightning:${bolt11}`}
                className="block text-center h-11 leading-[44px] rounded-full bg-fg text-bg font-medium text-sm hover:bg-fg2 transition-colors"
              >
                Open in wallet ↗
              </a>
            )}

            {requiresClaim && (
              <div className="rounded-xl bg-surface2 border border-border p-3">
                <div className="text-xs text-muted">
                  Your wallet doesn't support automatic verification.{" "}
                  <Link href={`/tickets/claim/${paymentId}`} className="text-accent underline underline-offset-2">
                    Paste your preimage to claim →
                  </Link>
                </div>
              </div>
            )}

            {!requiresClaim && !isMock && (
              <div className="text-[11px] text-muted text-center">
                Already paid?{" "}
                <Link href={`/tickets/claim/${paymentId}`} className="text-accent hover:underline">
                  Claim with preimage
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
