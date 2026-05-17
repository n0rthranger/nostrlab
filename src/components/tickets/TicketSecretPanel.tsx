"use client";

import { useEffect, useState } from "react";

interface Props {
  ticketId: string;
}

type State =
  | { kind: "locked" }
  | { kind: "loading" }
  | { kind: "ready"; qrUrl: string; proofId: string; paid: boolean }
  | { kind: "invalid" };

function secretFromHash(): string | null {
  const raw = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(raw);
  return params.get("secret");
}

export function TicketSecretPanel({ ticketId }: Props) {
  const [state, setState] = useState<State>({ kind: "locked" });

  useEffect(() => {
    const secret = secretFromHash();
    if (!secret) {
      setState({ kind: "locked" });
      return;
    }

    let cancelled = false;
    setState({ kind: "loading" });
    fetch(`/api/tickets/${ticketId}/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("bad secret");
        const json = await res.json();
        const credential = json.credential;
        if (!credential?.proof?.id) throw new Error("missing credential");
        const { default: QRCode } = await import("qrcode");
        const qrUrl = await QRCode.toDataURL(JSON.stringify(credential), {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 360,
        });
        return {
          qrUrl,
          proofId: credential.proof.id as string,
          paid: !!credential.payment,
        };
      })
      .then((ready) => {
        if (!cancelled) setState({ kind: "ready", ...ready });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "invalid" });
      });

    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  if (state.kind === "ready") {
    return (
      <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
        <img src={state.qrUrl} alt="Ticket QR" className="w-full" />
        <div className="mt-2 text-center text-[10px] font-mono text-black/55 truncate">
          {state.paid ? "signed paid ticket" : "signed ticket"} · {state.proofId.slice(0, 12)}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-surface2 border border-dashed border-border aspect-square grid place-items-center p-6">
      <div className="text-center text-muted">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <div className="text-xs">
          {state.kind === "loading"
            ? "Opening secure ticket..."
            : state.kind === "invalid"
            ? "Ticket secret is invalid."
            : "Open the original purchase URL to reveal the QR."}
        </div>
      </div>
    </div>
  );
}
