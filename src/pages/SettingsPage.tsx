import { useState } from "react";
import { useRelays } from "../hooks/useRelays";
import { useAuth } from "../hooks/useAuth";
import { useWallet } from "../hooks/useWallet";
import { useToast } from "../components/Toast";
import { DEFAULT_RELAYS, shortenKey } from "../lib/nostr";
import { clearCache } from "../lib/cache";
import { nip19 } from "nostr-tools";

export default function SettingsPage() {
  const { pubkey, npub, sk, isExtension } = useAuth();
  const { globalRelays, setGlobalRelays } = useRelays();
  const { connected: walletConnected, connectionString: nwcUri, balance, loading: walletLoading, connect: connectWallet, disconnect: disconnectWallet, refreshBalance } = useWallet();
  const { toast } = useToast();
  const [newRelay, setNewRelay] = useState("");
  const [nwcInput, setNwcInput] = useState("");
  const [showNsec, setShowNsec] = useState(false);

  const nsec = sk ? nip19.nsecEncode(sk) : null;
  const [testing, setTesting] = useState<Record<string, "ok" | "fail" | "testing">>({});

  const addRelay = () => {
    const url = newRelay.trim();
    if (!url || globalRelays.includes(url)) return;
    // Validate relay URL
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "wss:") {
        toast("Relay URL must start with wss://", "error");
        return;
      }
    } catch {
      toast("Invalid relay URL", "error");
      return;
    }
    setGlobalRelays([...globalRelays, url]);
    setNewRelay("");
    toast("Relay added", "success");
  };

  const removeRelay = (url: string) => {
    setGlobalRelays(globalRelays.filter((r) => r !== url));
    toast("Relay removed", "info");
  };

  const resetDefaults = () => {
    setGlobalRelays([...DEFAULT_RELAYS]);
    toast("Relays reset to defaults", "info");
  };

  const testRelay = (url: string) => {
    setTesting((prev) => ({ ...prev, [url]: "testing" }));
    let resolved = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      setTesting((prev) => ({ ...prev, [url]: "fail" }));
      return;
    }
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        setTesting((prev) => ({ ...prev, [url]: "fail" }));
      }
    }, 5000);
    ws.onopen = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        ws.close();
        setTesting((prev) => ({ ...prev, [url]: "ok" }));
      }
    };
    ws.onerror = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        ws.close();
        setTesting((prev) => ({ ...prev, [url]: "fail" }));
      }
    };
  };

  const testAll = () => {
    for (const relay of globalRelays) testRelay(relay);
  };

  return (
    <div className="max-w-2xl mx-auto animate-fadeIn">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      {/* Identity section */}
      {pubkey && (
        <div className="border border-border rounded-xl bg-bg-secondary mb-5">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Identity</h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Public Key (npub)</label>
              <div className="flex items-center gap-2">
                <code className="text-sm text-text-secondary break-all flex-1">{npub || shortenKey(pubkey)}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(npub || pubkey); toast("Public key copied", "success"); }}
                  className="btn btn-sm btn-icon shrink-0"
                  data-tooltip="Copy"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/>
                    <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>
                  </svg>
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Hex</label>
              <code className="text-xs text-text-muted break-all">{pubkey}</code>
            </div>
          </div>
        </div>
      )}

      {/* Secret Key section */}
      {pubkey && nsec && (
        <div className="border border-border rounded-xl bg-bg-secondary mb-5">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Secret Key</h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="bg-red/5 border border-red/20 rounded-lg p-3 flex items-start gap-2">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-red shrink-0 mt-0.5">
                <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575ZM8 5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5Zm1 6a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z"/>
              </svg>
              <div className="text-xs text-text-secondary">
                <p className="font-medium text-red mb-0.5">Never share your secret key!</p>
                <p>Anyone with your nsec has full control of your Nostr identity. Save it somewhere safe — if you lose it, your account cannot be recovered.</p>
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">nsec (secret key)</label>
              <div className="flex items-center gap-2">
                <code className="text-sm break-all flex-1 bg-bg-primary border border-border rounded-lg px-3 py-2 select-all">
                  {showNsec ? nsec : "nsec1" + "•".repeat(58)}
                </code>
                <button
                  onClick={() => setShowNsec(!showNsec)}
                  className="btn btn-sm btn-icon shrink-0"
                  data-tooltip={showNsec ? "Hide" : "Reveal"}
                >
                  {showNsec ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M.143 2.31a.75.75 0 0 1 1.047-.167l14.5 10.5a.75.75 0 1 1-.88 1.214l-2.248-1.628C11.346 13.19 9.748 13.75 8 13.75c-3.552 0-6.443-2.293-7.706-4.236a3.23 3.23 0 0 1 0-3.528 12.19 12.19 0 0 1 2.161-2.543L.31 1.857A.75.75 0 0 1 .143 2.31ZM6.154 6.533 4.336 5.217a10.69 10.69 0 0 0-2.048 2.319 1.73 1.73 0 0 0 0 1.928c1.1 1.694 3.58 3.786 5.712 3.786 1.327 0 2.572-.46 3.638-1.157L9.928 10.84A2.75 2.75 0 0 1 6.154 6.534ZM8 2.25c.557 0 1.1.07 1.623.2a.75.75 0 0 1-.374 1.452A5.71 5.71 0 0 0 8 3.75c-2.132 0-4.612 2.092-5.712 3.786a1.73 1.73 0 0 0 0 1.928c.218.335.464.656.736.96a.75.75 0 0 1-1.096 1.024 10.93 10.93 0 0 1-.874-1.143 3.23 3.23 0 0 1 0-3.528C2.435 4.827 4.815 2.25 8 2.25Zm4.283 3.456a.75.75 0 0 1 1.049.157c.394.55.748 1.14 1.051 1.76a3.23 3.23 0 0 1 0 2.224c-.42.862-.958 1.674-1.605 2.4a.75.75 0 0 1-1.118-1 10.1 10.1 0 0 0 1.37-2.043 1.73 1.73 0 0 0 0-1.208 10.7 10.7 0 0 0-.904-1.505.75.75 0 0 1 .157-1.049Z"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 2c-2.837 0-5.34 1.592-6.904 3.793a3.262 3.262 0 0 0 0 3.414C2.66 11.408 5.163 13 8 13s5.34-1.592 6.904-3.793a3.262 3.262 0 0 0 0-3.414C13.34 3.592 10.837 2 8 2Zm0 9.5c-2.353 0-4.476-1.287-5.876-3.223a1.762 1.762 0 0 1 0-2.054C3.524 4.287 5.647 3 8 3s4.476 1.287 5.876 3.223a1.762 1.762 0 0 1 0 2.054C12.476 10.213 10.353 11.5 8 11.5Zm0-6.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5ZM6.25 8a1.75 1.75 0 1 1 3.5 0 1.75 1.75 0 0 1-3.5 0Z"/>
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText(nsec); toast("Secret key copied — keep it safe!", "info"); }}
                  className="btn btn-sm btn-icon shrink-0"
                  data-tooltip="Copy"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/>
                    <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Extension notice */}
      {pubkey && isExtension && !nsec && (
        <div className="border border-border rounded-xl bg-bg-secondary mb-5">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Secret Key</h2>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-start gap-2 text-sm text-text-secondary">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-accent shrink-0 mt-0.5">
                <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/>
              </svg>
              <p>Your secret key is managed by your browser extension (NIP-07). Check your extension settings to back it up.</p>
            </div>
          </div>
        </div>
      )}

      {/* Relay section */}
      <div className="border border-border rounded-xl bg-bg-secondary">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Relay Configuration</h2>
            <p className="text-xs text-text-muted mt-0.5">{globalRelays.length} {globalRelays.length === 1 ? "relay" : "relays"} configured</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={testAll}
              className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:border-text-muted bg-transparent cursor-pointer"
            >
              Test All
            </button>
            <button
              onClick={resetDefaults}
              className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:border-text-muted bg-transparent cursor-pointer"
            >
              Reset Defaults
            </button>
          </div>
        </div>

        <div className="divide-y divide-border">
          {globalRelays.map((relay) => (
            <div key={relay} className="px-5 py-3 flex items-center gap-3">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  testing[relay] === "ok"
                    ? "bg-green"
                    : testing[relay] === "fail"
                    ? "bg-red"
                    : testing[relay] === "testing"
                    ? "bg-orange animate-pulse"
                    : "bg-text-muted/50"
                }`}
              />
              <span className="font-mono text-sm flex-1 truncate">{relay}</span>
              {testing[relay] === "ok" && <span className="text-xs text-green">Connected</span>}
              {testing[relay] === "fail" && <span className="text-xs text-red">Failed</span>}
              {testing[relay] === "testing" && <span className="text-xs text-orange">Testing...</span>}
              <button
                onClick={() => testRelay(relay)}
                className="text-xs text-text-muted hover:text-text-secondary cursor-pointer bg-transparent border-0 px-2 py-1"
              >
                Test
              </button>
              <button
                onClick={() => removeRelay(relay)}
                className="text-xs text-red/60 hover:text-red cursor-pointer bg-transparent border-0 px-2 py-1"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-border flex gap-2">
          <input
            type="text"
            value={newRelay}
            onChange={(e) => setNewRelay(e.target.value)}
            placeholder="wss://relay.example.com"
            className="flex-1 bg-bg-primary border border-border rounded-lg px-4 py-2 text-sm text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-accent"
            onKeyDown={(e) => e.key === "Enter" && addRelay()}
          />
          <button
            onClick={addRelay}
            disabled={!newRelay.trim().startsWith("wss://")}
            className="px-4 py-2 bg-green text-white rounded-lg text-sm font-medium disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:brightness-110"
          >
            Add Relay
          </button>
        </div>
      </div>

      {/* Wallet section */}
      <div className="border border-border rounded-xl bg-bg-secondary mt-5">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Wallet (NWC)</h2>
        </div>
        <div className="px-5 py-4">
          {walletConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-green" />
                <span className="text-sm text-text-primary font-medium">Wallet connected</span>
              </div>
              {walletLoading ? (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  Fetching balance...
                </div>
              ) : balance !== null ? (
                <div className="text-sm text-text-secondary">
                  Balance: <span className="text-orange font-medium">{balance.toLocaleString()} sats</span>
                </div>
              ) : (
                <div className="text-xs text-text-muted">
                  Balance not available (wallet may not support it)
                </div>
              )}
              <div className="text-xs text-text-muted font-mono break-all bg-bg-primary border border-border rounded-lg px-3 py-2">
                {nwcUri?.slice(0, 40)}...
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => refreshBalance()}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:border-text-muted bg-transparent cursor-pointer"
                >
                  Refresh Balance
                </button>
                <button
                  onClick={() => { disconnectWallet(); toast("Wallet disconnected", "info"); }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-red/30 text-red hover:bg-red/10 bg-transparent cursor-pointer"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-text-muted">
                Connect your Lightning wallet using Nostr Wallet Connect (NWC) to pay invoices and send zaps directly from NostrLab.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nwcInput}
                  onChange={(e) => setNwcInput(e.target.value)}
                  placeholder="nostr+walletconnect://..."
                  className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-2 text-xs text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
                <button
                  onClick={() => {
                    try {
                      connectWallet(nwcInput.trim());
                      setNwcInput("");
                      toast("Wallet connected!", "success");
                    } catch {
                      toast("Invalid NWC connection string", "error");
                    }
                  }}
                  disabled={!nwcInput.trim().startsWith("nostr+walletconnect://")}
                  className="px-4 py-2 bg-green text-white rounded-lg text-sm font-medium disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:brightness-110"
                >
                  Connect
                </button>
              </div>
              <p className="text-[11px] text-text-muted">
                Get an NWC string from your wallet (Alby, Mutiny, Coinos, etc.) and paste it above.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Cache section */}
      <div className="border border-border rounded-xl bg-bg-secondary mt-5">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Cache</h2>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-text-muted mb-3">
            NostrLab caches relay data locally in IndexedDB for faster loading. Clear the cache if you're seeing stale data.
          </p>
          <button
            onClick={async () => {
              await clearCache();
              toast("Cache cleared", "success");
            }}
            className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:border-text-muted bg-transparent cursor-pointer"
          >
            Clear Cache
          </button>
        </div>
      </div>

    </div>
  );
}
