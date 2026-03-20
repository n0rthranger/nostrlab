import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { nip04, nip47, SimplePool, getPublicKey, finalizeEvent } from "nostr-tools";

const STORAGE_KEY = "nostrlab-nwc";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

interface NWCState {
  walletPubkey: string;
  relay: string;
  secret: Uint8Array;
  secretHex: string;
  clientPubkey: string;
}

interface WalletContextType {
  connected: boolean;
  connectionString: string | null;
  balance: number | null;
  loading: boolean;
  connect: (connectionString: string) => void;
  disconnect: () => void;
  payInvoice: (bolt11: string) => Promise<{ preimage: string }>;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType>({
  connected: false,
  connectionString: null,
  balance: null,
  loading: false,
  connect: () => {},
  disconnect: () => {},
  payInvoice: async () => { throw new Error("No wallet connected"); },
  refreshBalance: async () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

function parseNWC(uri: string): NWCState {
  const parsed = nip47.parseConnectionString(uri);
  const secret = hexToBytes(parsed.secret);
  return {
    walletPubkey: parsed.pubkey,
    relay: parsed.relay,
    secret,
    secretHex: parsed.secret,
    clientPubkey: getPublicKey(secret),
  };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [connectionString, setConnectionString] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY);
  });
  const [nwc, setNwc] = useState<NWCState | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    try { return parseNWC(stored); } catch { return null; }
  });
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const connect = useCallback((uri: string) => {
    const parsed = parseNWC(uri);
    localStorage.setItem(STORAGE_KEY, uri);
    setConnectionString(uri);
    setNwc(parsed);
    setBalance(null);
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setConnectionString(null);
    setNwc(null);
    setBalance(null);
  }, []);

  const sendNWCRequest = useCallback(async (
    method: string,
    params: Record<string, unknown>,
    timeoutMs = 15000,
  ): Promise<Record<string, unknown>> => {
    if (!nwc) throw new Error("No wallet connected");

    const pool = new SimplePool();
    const content = JSON.stringify({ method, params });
    const encrypted = await nip04.encrypt(nwc.secretHex, nwc.walletPubkey, content);

    const event = finalizeEvent({
      kind: 23194,
      created_at: Math.floor(Date.now() / 1000),
      content: encrypted,
      tags: [["p", nwc.walletPubkey]],
    }, nwc.secret);

    try {
      // Subscribe FIRST, then publish — avoids race where response arrives before we listen
      const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timeout = setTimeout(() => {
          sub.close();
          reject(new Error("Wallet response timed out"));
        }, timeoutMs);

        const sub = pool.subscribeMany([nwc.relay], [{
          kinds: [23195],
          authors: [nwc.walletPubkey],
          "#p": [nwc.clientPubkey],
          "#e": [event.id],
          since: event.created_at - 10,
        }], {
          onevent: async (responseEvent) => {
            clearTimeout(timeout);
            sub.close();
            try {
              const decrypted = await nip04.decrypt(nwc.secretHex, nwc.walletPubkey, responseEvent.content);
              const parsed = JSON.parse(decrypted);
              if (parsed.error) {
                reject(new Error(parsed.error.message || "Wallet error"));
              } else {
                resolve(parsed.result || parsed);
              }
            } catch (err) {
              reject(err);
            }
          },
          oneose: () => {
            // Keep subscription open — waiting for wallet to respond
          },
        });

        // Publish after subscription is set up
        Promise.allSettled(pool.publish([nwc.relay], event));
      });

      return result;
    } finally {
      pool.close([nwc.relay]);
    }
  }, [nwc]);

  const payInvoice = useCallback(async (bolt11: string): Promise<{ preimage: string }> => {
    const result = await sendNWCRequest("pay_invoice", { invoice: bolt11 }, 60000);
    return { preimage: (result as { preimage?: string }).preimage || "" };
  }, [sendNWCRequest]);

  const refreshBalance = useCallback(async () => {
    if (!nwc) return;
    setLoading(true);
    try {
      const result = await sendNWCRequest("get_balance", {}, 10000);
      const balanceMsats = (result as { balance?: number }).balance;
      if (typeof balanceMsats === "number") {
        setBalance(Math.floor(balanceMsats / 1000));
      }
    } catch {
      // Not all wallets support get_balance — silently ignore
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [nwc, sendNWCRequest]);

  // Fetch balance on connect
  useEffect(() => {
    if (nwc) refreshBalance();
  }, [nwc, refreshBalance]);

  return (
    <WalletContext.Provider value={{
      connected: !!nwc,
      connectionString,
      balance,
      loading,
      connect,
      disconnect,
      payInvoice,
      refreshBalance,
    }}>
      {children}
    </WalletContext.Provider>
  );
}
