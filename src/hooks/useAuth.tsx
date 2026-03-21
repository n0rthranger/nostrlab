import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  generateKeys,
  keysFromNsec,
  getPublicKeyFromExtension,
  signEventWithExtension,
  npubFromPubkey,
  type Signer,
} from "../lib/nostr";
import { finalizeEvent, type Event, type EventTemplate } from "nostr-tools";
import { encrypt as nip49Encrypt, decrypt as nip49Decrypt } from "nostr-tools/nip49";
import { nip19 } from "nostr-tools";

interface AuthState {
  pubkey: string | null;
  npub: string | null;
  sk: Uint8Array | null;
  isExtension: boolean;
  signer: Signer | null;
  /** True when an encrypted key exists but hasn't been unlocked yet */
  needsUnlock: boolean;
  login: (nsec: string, password: string) => void;
  loginWithExtension: () => Promise<boolean>;
  generateAndLogin: (password: string) => { nsec: string; npub: string };
  unlock: (password: string) => boolean;
  logout: () => void;
  signEvent: (event: EventTemplate) => Promise<Event | null>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [sk, setSk] = useState<Uint8Array | null>(null);
  const [isExtension, setIsExtension] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);

  // On mount, check stored auth
  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = localStorage.getItem("nostrlab-auth");
      if (!stored) return;

      try {
        const data = JSON.parse(stored);

        if (data.type === "ncryptsec") {
          // Check if we have a session-cached decrypted key
          const sessionNsec = sessionStorage.getItem("nostrlab-session-key");
          if (sessionNsec) {
            try {
              const keys = keysFromNsec(sessionNsec);
              setSk(keys.sk);
              setPubkey(keys.pk);
            } catch {
              sessionStorage.removeItem("nostrlab-session-key");
              if (data.pubkey) setPubkey(data.pubkey);
              setNeedsUnlock(true);
            }
          } else {
            // Encrypted key — need password to unlock
            if (data.pubkey) setPubkey(data.pubkey);
            setNeedsUnlock(true);
          }
        } else if (data.type === "nsec") {
          // Legacy plaintext — migrate on next login, but still load
          const keys = keysFromNsec(data.value);
          setSk(keys.sk);
          setPubkey(keys.pk);
        } else if (data.type === "extension") {
          const pk = await getPublicKeyFromExtension();
          if (!mounted) return;
          if (pk) {
            setPubkey(pk);
            setIsExtension(true);
          } else {
            localStorage.removeItem("nostrlab-auth");
          }
        }
      } catch {
        localStorage.removeItem("nostrlab-auth");
      }
    })();
    return () => { mounted = false; };
  }, []);

  const login = useCallback((nsec: string, password: string) => {
    const keys = keysFromNsec(nsec);
    setSk(keys.sk);
    setPubkey(keys.pk);
    setIsExtension(false);
    setNeedsUnlock(false);

    // Encrypt with NIP-49 before storing
    const ncryptsec = nip49Encrypt(keys.sk, password, 16);
    localStorage.setItem(
      "nostrlab-auth",
      JSON.stringify({ type: "ncryptsec", value: ncryptsec, pubkey: keys.pk }),
    );
    // Cache decrypted key for this browser session (cleared on tab close)
    sessionStorage.setItem("nostrlab-session-key", nsec);
  }, []);

  const loginWithExtension = useCallback(async () => {
    const pk = await getPublicKeyFromExtension();
    if (!pk) return false;
    setPubkey(pk);
    setSk(null);
    setIsExtension(true);
    setNeedsUnlock(false);
    localStorage.setItem("nostrlab-auth", JSON.stringify({ type: "extension" }));
    return true;
  }, []);

  const generateAndLogin = useCallback((password: string) => {
    const keys = generateKeys();
    setSk(keys.sk);
    setPubkey(keys.pk);
    setIsExtension(false);
    setNeedsUnlock(false);

    // Encrypt with NIP-49 before storing
    const ncryptsec = nip49Encrypt(keys.sk, password, 16);
    localStorage.setItem(
      "nostrlab-auth",
      JSON.stringify({ type: "ncryptsec", value: ncryptsec, pubkey: keys.pk }),
    );
    // Cache decrypted key for this browser session
    sessionStorage.setItem("nostrlab-session-key", keys.nsec);
    return { nsec: keys.nsec, npub: keys.npub };
  }, []);

  const unlock = useCallback((password: string): boolean => {
    const stored = localStorage.getItem("nostrlab-auth");
    if (!stored) return false;

    try {
      const data = JSON.parse(stored);

      if (data.type === "ncryptsec") {
        const decryptedSk = nip49Decrypt(data.value, password);
        setSk(decryptedSk);
        const nsec = nip19.nsecEncode(decryptedSk);
        const keys = keysFromNsec(nsec);
        setPubkey(keys.pk);
        setNeedsUnlock(false);
        // Cache for this browser session
        sessionStorage.setItem("nostrlab-session-key", nsec);
        return true;
      } else if (data.type === "nsec") {
        // Legacy plaintext — migrate to encrypted
        const keys = keysFromNsec(data.value);
        setSk(keys.sk);
        setPubkey(keys.pk);
        setNeedsUnlock(false);

        const ncryptsec = nip49Encrypt(keys.sk, password, 16);
        localStorage.setItem(
          "nostrlab-auth",
          JSON.stringify({ type: "ncryptsec", value: ncryptsec, pubkey: keys.pk }),
        );
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setPubkey(null);
    setSk(null);
    setIsExtension(false);
    setNeedsUnlock(false);
    localStorage.removeItem("nostrlab-auth");
    sessionStorage.removeItem("nostrlab-session-key");
  }, []);

  const signEvent = useCallback(
    async (event: EventTemplate): Promise<Event | null> => {
      if (isExtension) {
        return signEventWithExtension(event);
      }
      if (sk) {
        return finalizeEvent(event, sk);
      }
      return null;
    },
    [sk, isExtension],
  );

  const signer: Signer | null = useMemo(() => {
    if (sk) return sk;
    if (isExtension)
      return async (event: EventTemplate) => {
        const signed = await signEventWithExtension(event);
        if (!signed) throw new Error("Extension signing failed or was rejected");
        return signed;
      };
    return null;
  }, [sk, isExtension]);

  return (
    <AuthContext.Provider
      value={{
        pubkey,
        npub: pubkey ? npubFromPubkey(pubkey) : null,
        sk,
        isExtension,
        signer,
        needsUnlock,
        login,
        loginWithExtension,
        generateAndLogin,
        unlock,
        logout,
        signEvent,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
