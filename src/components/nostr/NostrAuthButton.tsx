"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import QRCode from "qrcode";
import { useNostr } from "@/hooks/useNostr";
import { Avatar } from "@/components/ui/Avatar";
import { shortNpub } from "@/lib/utils";

export function NostrAuthButton() {
  const { identity, profile, login, logout, hasSigner, loading, signerType } = useNostr();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  if (loading) return <div className="w-24 h-9" />;

  if (!identity) {
    return (
      <div className="flex flex-col items-end gap-1 shrink-0">
        <button
          onClick={async () => {
            if (!hasSigner) {
              setSetupOpen(true);
              return;
            }
            setErr(null); setBusy(true);
            try { await login(); }
            catch (e) { setErr(e instanceof Error ? e.message : "Login failed"); }
            finally { setBusy(false); }
          }}
          disabled={busy}
          title="Sign in"
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-white px-4 text-[13px] font-semibold text-zinc-950 shadow-soft transition hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50 sm:text-sm focus-ring"
        >
          {busy ? (
            <>
              <span className="truncate whitespace-nowrap">Signing in</span>
            </>
          ) : (
            <span className="truncate whitespace-nowrap">Sign in</span>
          )}
        </button>
        {err && <div className="text-[11px] text-danger max-w-[260px] text-right">{err}</div>}
        {setupOpen && <SignerSetupModal onClose={() => setSetupOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 pr-3 pl-1 h-9 rounded-full hover:bg-surface2 transition-colors focus-ring"
      >
        <Avatar
          src={profile?.picture}
          alt={profile?.displayName ?? identity.npub}
          seed={identity.pubkey}
          size={28}
        />
        <span className="text-sm font-medium hidden sm:inline">
          {profile?.displayName ?? profile?.name ?? shortNpub(identity.npub)}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-72 rounded-2xl bg-elev border border-border shadow-lg overflow-hidden animate-rise"
          onMouseLeave={() => setOpen(false)}
          role="menu"
        >
          <div className="px-4 pt-3 pb-3 border-b border-border">
            <div className="flex items-center gap-3">
              <Avatar
                src={profile?.picture}
                alt={profile?.displayName ?? identity.npub}
                seed={identity.pubkey}
                size={42}
              />
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {profile?.displayName ?? profile?.name ?? "Anon"}
                </div>
                <div className="text-[11px] text-muted font-mono truncate">{shortNpub(identity.npub)}</div>
                {signerType === "nip46" && (
                  <div className="mt-1 text-[11px] font-medium text-accent">Nostr Connect</div>
                )}
              </div>
            </div>
          </div>
          <div className="p-1.5">
            <DropLink href="/dashboard" onClick={() => setOpen(false)}
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>}>
              Dashboard
            </DropLink>
            <DropLink href="/events/create" onClick={() => setOpen(false)}
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}>
              New event
            </DropLink>
          </div>
          <div className="p-1.5 border-t border-border">
            <button
              onClick={() => { logout(); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-muted hover:bg-surface2 hover:text-danger transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SignerSetupModal({ onClose }: { onClose: () => void }) {
  const { loginWithNostrConnect, loginWithBunker, hasSigner, login } = useNostr();
  const abortRef = useRef<AbortController | null>(null);
  const [uri, setUri] = useState("");
  const [qr, setQr] = useState("");
  const [bunker, setBunker] = useState("");
  const [busy, setBusy] = useState<"nip07" | "connect" | "bunker" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!uri) {
      setQr("");
      return;
    }
    QRCode.toDataURL(uri, { margin: 1, width: 220 })
      .then(setQr)
      .catch(() => setQr(""));
  }, [uri]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (typeof document === "undefined") return null;

  async function connectNip07() {
    setErr(null);
    setBusy("nip07");
    try {
      await login();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Login failed.");
    } finally {
      setBusy(null);
    }
  }

  async function connectNostrConnect() {
    setErr(null);
    setUri("");
    const abort = new AbortController();
    abortRef.current?.abort();
    abortRef.current = abort;
    setBusy("connect");
    try {
      await loginWithNostrConnect({
        signal: abort.signal,
        onUri: (nextUri) => {
          setUri(nextUri);
          window.location.href = nextUri;
        },
      });
      onClose();
    } catch (e) {
      if (abort.signal.aborted) return;
      setErr(e instanceof Error ? e.message : "Nostr Connect failed.");
    } finally {
      setBusy(null);
    }
  }

  async function connectBunker(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy("bunker");
    try {
      await loginWithBunker(bunker);
      onClose();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Bunker connection failed.");
    } finally {
      setBusy(null);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] grid min-h-dvh place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signer-setup-title"
        className="w-full max-w-md overflow-hidden rounded-lg border border-white/10 bg-zinc-950 text-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
              Nostr signer
            </div>
            <h2 id="signer-setup-title" className="mt-1 text-xl font-semibold">Bring your own key</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <p className="text-sm leading-relaxed text-zinc-300">
            Sign with a browser extension or connect a mobile/remote signer. NostrLab never asks for your nsec.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={connectNip07}
              disabled={!hasSigner || !!busy}
              className="flex h-11 items-center justify-center rounded-md border border-white/10 px-4 text-sm font-semibold text-white transition hover:border-orange-300/60 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy === "nip07" ? "Signing in" : "Use extension"}
            </button>
            <button
              type="button"
              onClick={connectNostrConnect}
              disabled={!!busy}
              className="flex h-11 items-center justify-center rounded-md border border-orange-300/40 bg-orange-300 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-60"
            >
              {busy === "connect" ? "Waiting..." : "Nostr Connect"}
            </button>
          </div>

          {uri && (
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <div className="flex flex-col items-center gap-3">
                {qr ? (
                  <img src={qr} alt="Nostr Connect QR code" className="h-[220px] w-[220px] rounded bg-white p-2" />
                ) : (
                  <div className="grid h-[220px] w-[220px] place-items-center rounded bg-white/10 text-xs text-zinc-400">
                    QR unavailable
                  </div>
                )}
                <a
                  href={uri}
                  className="inline-flex h-9 items-center rounded-full bg-white px-4 text-xs font-semibold text-zinc-950 hover:bg-zinc-200"
                >
                  Open signer app
                </a>
              </div>
            </div>
          )}

          <form onSubmit={connectBunker} className="space-y-2 border-t border-white/10 pt-4">
            <label className="block text-xs font-medium text-zinc-300">Bunker token</label>
            <input
              value={bunker}
              onChange={(e) => setBunker(e.target.value)}
              placeholder="bunker://..."
              className="h-10 w-full rounded-md border border-white/10 bg-zinc-900 px-3 text-xs text-white outline-none placeholder:text-zinc-500 focus:border-orange-300"
            />
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-zinc-500">Paste a remote signer token when QR login is not available.</div>
              <button
                type="submit"
                disabled={!!busy || !bunker.trim()}
                className="h-9 shrink-0 rounded-full border border-white/10 px-3 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-45"
              >
                {busy === "bunker" ? "Connecting" : "Connect"}
              </button>
            </div>
          </form>

          <div className="grid gap-2 border-t border-white/10 pt-4">
            <SignerLink href="https://getalby.com" label="Alby" />
            <SignerLink href="https://github.com/fiatjaf/nos2x" label="nos2x" />
          </div>
          {err && <div className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{err}</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}

function SignerLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex h-11 items-center justify-between rounded-md border border-white/10 px-4 text-sm font-semibold text-white transition hover:border-orange-300/60 hover:bg-white/10"
    >
      {label}
      <span aria-hidden="true">Open</span>
    </a>
  );
}

function DropLink({ href, children, icon, onClick }: { href: string; children: React.ReactNode; icon: React.ReactNode; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-fg hover:bg-surface2 transition-colors">
      <span className="text-muted">{icon}</span>
      {children}
    </Link>
  );
}
