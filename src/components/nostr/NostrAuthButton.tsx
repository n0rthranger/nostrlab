"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useNostr } from "@/hooks/useNostr";
import { Avatar } from "@/components/ui/Avatar";
import { shortNpub } from "@/lib/utils";

export function NostrAuthButton() {
  const { identity, profile, login, logout, hasSigner, loading } = useNostr();
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
          title={hasSigner ? "Sign in via NIP-07" : "Install Alby or nos2x"}
          className="h-9 w-9 sm:w-auto sm:px-4 inline-flex items-center justify-center gap-2 rounded-full bg-white text-zinc-950 text-sm font-medium hover:bg-zinc-200 active:scale-[0.98] transition disabled:opacity-50 shadow-soft focus-ring"
        >
          {busy ? (
            <>
              <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
              <span className="hidden sm:inline">Signing in</span>
            </>
          ) : (
            <>
              <svg className="sm:hidden" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 7a2 2 0 1 0-2-2" />
                <path d="M17.5 8.5 21 5" />
                <path d="M11 13a5 5 0 1 0 4 4.9" />
                <path d="m15 13 5 5" />
                <path d="m20 13-5 5" />
              </svg>
              <span className="hidden sm:inline">{hasSigner ? "Sign in" : "Install signer"}</span>
            </>
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
        onClick={() => setOpen((o) => !o)}
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
          className="absolute right-0 mt-2 w-72 rounded-2xl bg-elev border border-border shadow-lg overflow-hidden z-30 animate-rise"
          onMouseLeave={() => setOpen(false)}
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
  if (typeof document === "undefined") return null;

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
            NostrLab signs events with a NIP-07 browser extension. Install one, refresh, and your npub becomes the account.
          </p>
          <div className="grid gap-2">
            <SignerLink href="https://getalby.com" label="Alby" />
            <SignerLink href="https://github.com/fiatjaf/nos2x" label="nos2x" />
          </div>
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
