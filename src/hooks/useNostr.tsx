"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { hexToNpub } from "@/lib/nostr/encode";
import { authUrl, buildNip98AuthEvent, nip98AuthorizationHeader } from "@/lib/auth-client";
import type { Nip07Signer, NostrEvent, UnsignedEvent } from "@/lib/nostr/types";
import {
  closeRemoteSignerPool,
  connectWithBunkerInput,
  connectWithNostrConnect,
  createNostrConnectChallenge,
  signerFromStorage,
  type RemoteSignerStorage,
} from "@/lib/nostr/remote-signer";

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
  signerType: "nip07" | "nip46" | null;
  loading: boolean;
  login: () => Promise<NostrIdentity>;
  loginWithNostrConnect: (options?: {
    onUri?: (uri: string) => void;
    signal?: AbortSignal;
  }) => Promise<NostrIdentity>;
  loginWithBunker: (input: string) => Promise<NostrIdentity>;
  logout: () => void;
  signEvent: (e: UnsignedEvent) => Promise<NostrEvent>;
  signer: Nip07Signer | null;
}

const NostrContext = createContext<NostrContextValue | null>(null);

const STORAGE_KEY = "nostrlab:identity:v1";
const REMOTE_SIGNER_KEY = "nostrlab:remote-signer:v1";

export function NostrProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<NostrIdentity | null>(null);
  const [profile, setProfile] = useState<ProfileMeta | null>(null);
  const [hasSigner, setHasSigner] = useState(false);
  const [signerType, setSignerType] = useState<"nip07" | "nip46" | null>(null);
  const [loading, setLoading] = useState(true);
  const remoteSignerRef = useRef<ReturnType<typeof signerFromStorage> | null>(null);

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
        const remoteRaw = localStorage.getItem(REMOTE_SIGNER_KEY);
        if (remoteRaw) {
          const remote = JSON.parse(remoteRaw) as RemoteSignerStorage;
          if (remote.userPubkey === parsed.pubkey) setSignerType("nip46");
          else localStorage.removeItem(REMOTE_SIGNER_KEY);
        } else {
          setSignerType("nip07");
        }
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

  const establishSession = useCallback(async (
    pubkey: string,
    signer: Pick<Nip07Signer, "signEvent">,
    type: "nip07" | "nip46",
    remoteStorage?: RemoteSignerStorage
  ) => {
    const signedAuthEvent = await signer.signEvent(await buildNip98AuthEvent({
      pubkey,
      url: authUrl("/api/auth/session"),
      method: "POST",
      tags: [
        ["action", "session.login"],
        ["app", "nostrlab"],
      ],
    }));
    const sessionRes = await fetch("/api/auth/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: nip98AuthorizationHeader(signedAuthEvent),
      },
      body: JSON.stringify({}),
    });
    if (!sessionRes.ok) {
      throw new Error("Couldn't establish a server session.");
    }
    const id: NostrIdentity = { pubkey, npub: hexToNpub(pubkey) };
    setIdentity(id);
    setSignerType(type);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(id));
    if (remoteStorage) {
      localStorage.setItem(REMOTE_SIGNER_KEY, JSON.stringify(remoteStorage));
    } else {
      localStorage.removeItem(REMOTE_SIGNER_KEY);
      remoteSignerRef.current = null;
    }

    // Fire-and-forget profile warm-up so the indexer caches kind:0.
    fetch(`/api/users/${pubkey}/refresh`, { method: "POST" }).catch(() => {});
    return id;
  }, []);

  const login = useCallback(async () => {
    if (typeof window === "undefined" || !window.nostr) {
      throw new Error(
        "No NIP-07 signer found. Use Nostr Connect or install Alby, nos2x, or another Nostr browser extension."
      );
    }
    const pubkey = await window.nostr.getPublicKey();
    return establishSession(pubkey, window.nostr, "nip07");
  }, [establishSession]);

  const loginWithNostrConnect = useCallback<NostrContextValue["loginWithNostrConnect"]>(async (options) => {
    const challenge = createNostrConnectChallenge();
    options?.onUri?.(challenge.uri);
    const { signer, storage } = await connectWithNostrConnect(challenge, options?.signal);
    remoteSignerRef.current = signer;
    return establishSession(storage.userPubkey, signer, "nip46", storage);
  }, [establishSession]);

  const loginWithBunker = useCallback<NostrContextValue["loginWithBunker"]>(async (input) => {
    const { signer, storage } = await connectWithBunkerInput(input);
    remoteSignerRef.current = signer;
    return establishSession(storage.userPubkey, signer, "nip46", storage);
  }, [establishSession]);

  const logout = useCallback(() => {
    setIdentity(null);
    setProfile(null);
    setSignerType(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(REMOTE_SIGNER_KEY);
    remoteSignerRef.current?.close().catch(() => {});
    remoteSignerRef.current = null;
    closeRemoteSignerPool();
    fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
  }, []);

  const signEvent = useCallback<NostrContextValue["signEvent"]>(async (e) => {
    if (signerType === "nip46") {
      let signer = remoteSignerRef.current;
      if (!signer) {
        const raw = localStorage.getItem(REMOTE_SIGNER_KEY);
        if (!raw) throw new Error("Remote signer session is missing. Sign in again.");
        signer = signerFromStorage(JSON.parse(raw) as RemoteSignerStorage);
        remoteSignerRef.current = signer;
      }
      return signer.signEvent(e) as Promise<NostrEvent>;
    }
    if (typeof window === "undefined" || !window.nostr) {
      throw new Error("No signer available. Sign in with Nostr Connect or a NIP-07 extension.");
    }
    return window.nostr.signEvent(e);
  }, [signerType]);

  const value = useMemo<NostrContextValue>(
    () => ({
      identity,
      profile,
      hasSigner,
      signerType,
      loading,
      login,
      loginWithNostrConnect,
      loginWithBunker,
      logout,
      signEvent,
      signer: typeof window !== "undefined" ? window.nostr ?? null : null,
    }),
    [identity, profile, hasSigner, signerType, loading, login, loginWithNostrConnect, loginWithBunker, logout, signEvent]
  );

  return <NostrContext.Provider value={value}>{children}</NostrContext.Provider>;
}

export function useNostr(): NostrContextValue {
  const ctx = useContext(NostrContext);
  if (!ctx) throw new Error("useNostr must be used inside <NostrProvider>");
  return ctx;
}
