"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { hexToNpub } from "@/lib/nostr/encode";
import type { Nip07Signer, NostrEvent, UnsignedEvent } from "@/lib/nostr/types";

interface NostrIdentity {
  pubkey: string;
  npub: string;
}

interface ProfileMeta {
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  lud16?: string;
}

interface NostrContextValue {
  identity: NostrIdentity | null;
  profile: ProfileMeta | null;
  hasSigner: boolean;
  loading: boolean;
  login: () => Promise<NostrIdentity>;
  logout: () => void;
  signEvent: (e: UnsignedEvent) => Promise<NostrEvent>;
  signer: Nip07Signer | null;
}

const NostrContext = createContext<NostrContextValue | null>(null);

const STORAGE_KEY = "nostrlab:identity:v1";

export function NostrProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<NostrIdentity | null>(null);
  const [profile, setProfile] = useState<ProfileMeta | null>(null);
  const [hasSigner, setHasSigner] = useState(false);
  const [loading, setLoading] = useState(true);

  // Detect a NIP-07 signer.
  useEffect(() => {
    const detect = () => setHasSigner(typeof window !== "undefined" && !!window.nostr);
    detect();
    const t = setInterval(detect, 1000);
    return () => clearInterval(t);
  }, []);

  // Restore identity on load.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as NostrIdentity;
        setIdentity(parsed);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  // Resolve profile metadata via our own indexer when we have an identity.
  useEffect(() => {
    if (!identity) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/users/${identity.pubkey}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setProfile({
          name: j.name,
          displayName: j.displayName,
          picture: j.picture,
          about: j.about,
          nip05: j.nip05,
          lud16: j.lud16,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [identity]);

  const login = useCallback(async () => {
    if (typeof window === "undefined" || !window.nostr) {
      throw new Error(
        "No NIP-07 signer found. Install Alby, nos2x, or another Nostr browser extension."
      );
    }
    const pubkey = await window.nostr.getPublicKey();
    const signedAuthEvent = await window.nostr.signEvent({
      pubkey,
      kind: 27235,
      created_at: Math.floor(Date.now() / 1000),
      content: "",
      tags: [
        ["action", "session.login"],
        ["app", "nostrlab"],
      ],
    });
    const sessionRes = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signedAuthEvent }),
    });
    if (!sessionRes.ok) {
      throw new Error("Couldn't establish a server session.");
    }
    const id: NostrIdentity = { pubkey, npub: hexToNpub(pubkey) };
    setIdentity(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(id));

    // Fire-and-forget profile warm-up so the indexer caches kind:0.
    fetch(`/api/users/${pubkey}/refresh`, { method: "POST" }).catch(() => {});
    return id;
  }, []);

  const logout = useCallback(() => {
    setIdentity(null);
    setProfile(null);
    localStorage.removeItem(STORAGE_KEY);
    fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
  }, []);

  const signEvent = useCallback<NostrContextValue["signEvent"]>(async (e) => {
    if (typeof window === "undefined" || !window.nostr) {
      throw new Error("No NIP-07 signer available");
    }
    return window.nostr.signEvent(e);
  }, []);

  const value = useMemo<NostrContextValue>(
    () => ({
      identity,
      profile,
      hasSigner,
      loading,
      login,
      logout,
      signEvent,
      signer: typeof window !== "undefined" ? window.nostr ?? null : null,
    }),
    [identity, profile, hasSigner, loading, login, logout, signEvent]
  );

  return <NostrContext.Provider value={value}>{children}</NostrContext.Provider>;
}

export function useNostr(): NostrContextValue {
  const ctx = useContext(NostrContext);
  if (!ctx) throw new Error("useNostr must be used inside <NostrProvider>");
  return ctx;
}
