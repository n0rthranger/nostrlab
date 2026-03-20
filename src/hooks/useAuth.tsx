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

interface AuthState {
  pubkey: string | null;
  npub: string | null;
  sk: Uint8Array | null;
  isExtension: boolean;
  signer: Signer | null;
  login: (nsec: string) => void;
  loginWithExtension: () => Promise<boolean>;
  generateAndLogin: () => { nsec: string; npub: string };
  logout: () => void;
  signEvent: (event: EventTemplate) => Promise<Event | null>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [sk, setSk] = useState<Uint8Array | null>(null);
  const [isExtension, setIsExtension] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = localStorage.getItem("nostrlab-auth");
      if (stored) {
        try {
          const { type, value } = JSON.parse(stored);
          if (type === "nsec") {
            const keys = keysFromNsec(value);
            setSk(keys.sk);
            setPubkey(keys.pk);
          } else if (type === "extension") {
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
      }
    })();
    return () => { mounted = false; };
  }, []);

  const login = useCallback((nsec: string) => {
    const keys = keysFromNsec(nsec);
    setSk(keys.sk);
    setPubkey(keys.pk);
    setIsExtension(false);
    localStorage.setItem("nostrlab-auth", JSON.stringify({ type: "nsec", value: nsec }));
  }, []);

  const loginWithExtension = useCallback(async () => {
    const pk = await getPublicKeyFromExtension();
    if (!pk) return false;
    setPubkey(pk);
    setSk(null);
    setIsExtension(true);
    localStorage.setItem("nostrlab-auth", JSON.stringify({ type: "extension" }));
    return true;
  }, []);

  const generateAndLogin = useCallback(() => {
    const keys = generateKeys();
    setSk(keys.sk);
    setPubkey(keys.pk);
    setIsExtension(false);
    localStorage.setItem(
      "nostrlab-auth",
      JSON.stringify({ type: "nsec", value: keys.nsec })
    );
    return { nsec: keys.nsec, npub: keys.npub };
  }, []);

  const logout = useCallback(() => {
    setPubkey(null);
    setSk(null);
    setIsExtension(false);
    localStorage.removeItem("nostrlab-auth");
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
    [sk, isExtension]
  );

  // Signer compatible with lib functions — works for both nsec and extension users
  const signer: Signer | null = useMemo(() => {
    if (sk) return sk;
    if (isExtension) return (async (event: EventTemplate) => {
      const signed = await signEventWithExtension(event);
      if (!signed) throw new Error("Extension signing failed or was rejected");
      return signed;
    });
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
        login,
        loginWithExtension,
        generateAndLogin,
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
