import { useState, useEffect, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { useRelays } from "../hooks/useRelays";
import { useWallet } from "../hooks/useWallet";
import { useToast } from "./Toast";
import { fetchZapReceipts, resolveLud16, requestZapInvoice } from "../lib/nostr";
import type { LnurlPayInfo } from "../lib/nostr";

interface Props {
  targetId: string;
  targetPubkey: string;
  lud16?: string;
  className?: string;
}

function formatSats(msats: number): string {
  const sats = Math.floor(msats / 1000);
  if (sats >= 1000000) return `${(sats / 1000000).toFixed(1)}M`;
  if (sats >= 1000) return `${(sats / 1000).toFixed(1)}k`;
  return String(sats);
}

const PRESET_AMOUNTS = [21, 100, 500, 1000, 5000];

declare global {
  interface Window {
    webln?: {
      enable: () => Promise<void>;
      sendPayment: (invoice: string) => Promise<{ preimage: string }>;
    };
  }
}

export default function ZapButton({ targetId, targetPubkey, lud16, className = "" }: Props) {
  const { pubkey, signer } = useAuth();
  const { globalRelays } = useRelays();
  const { connected: nwcConnected, payInvoice: nwcPayInvoice } = useWallet();
  const { toast } = useToast();
  const [totalMsats, setTotalMsats] = useState(0);
  const [zapCount, setZapCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [lnurlInfo, setLnurlInfo] = useState<LnurlPayInfo | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchZapReceipts([targetId], globalRelays).then((zaps) => {
      setZapCount(zaps.length);
      setTotalMsats(zaps.reduce((sum, z) => sum + z.amountMsats, 0));
    });
  }, [targetId, globalRelays]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setInvoice(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Resolve lud16 when menu opens
  useEffect(() => {
    if (!menuOpen || !lud16 || lnurlInfo) return;
    let cancelled = false;
    resolveLud16(lud16).then((info) => {
      if (!cancelled) setLnurlInfo(info);
    }).catch(() => {
      if (!cancelled) toast("Could not resolve lightning address", "error");
    });
    return () => { cancelled = true; };
  }, [menuOpen, lud16, lnurlInfo, toast]);

  // Always show — if no lud16, clicking will explain why it can't zap

  const sendZap = async (sats: number) => {
    if (!signer || !lnurlInfo) return;
    const amountMsats = sats * 1000;

    if (amountMsats < lnurlInfo.minSendable || amountMsats > lnurlInfo.maxSendable) {
      toast(`Amount must be between ${Math.ceil(lnurlInfo.minSendable / 1000)} and ${Math.floor(lnurlInfo.maxSendable / 1000)} sats`, "error");
      return;
    }

    setSending(true);
    try {
      const bolt11 = await requestZapInvoice(signer, {
        recipientPubkey: targetPubkey,
        targetId,
        amountMsats,
        lnurlPayInfo: lnurlInfo,
        content: comment,
        relays: globalRelays,
      });

      // Try NWC first (Nostr Wallet Connect)
      if (nwcConnected) {
        try {
          await nwcPayInvoice(bolt11);
          toast(`Zapped ${sats} sats!`, "success");
          setZapCount((c) => c + 1);
          setTotalMsats((t) => t + amountMsats);
          setMenuOpen(false);
          setComment("");
          setInvoice(null);
          return;
        } catch {
          // NWC failed — fall through to WebLN
        }
      }

      // Try WebLN (browser extensions like Alby)
      if (window.webln) {
        try {
          await window.webln.enable();
          await window.webln.sendPayment(bolt11);
          toast(`Zapped ${sats} sats!`, "success");
          setZapCount((c) => c + 1);
          setTotalMsats((t) => t + amountMsats);
          setMenuOpen(false);
          setComment("");
          setInvoice(null);
          return;
        } catch {
          // WebLN failed — fall through to invoice display
        }
      }

      // Fallback: show invoice for manual payment
      setInvoice(bolt11);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to create invoice", "error");
    } finally {
      setSending(false);
    }
  };

  const handleCustomSend = () => {
    const sats = parseInt(customAmount, 10);
    if (!sats || sats < 1) {
      toast("Enter a valid amount", "error");
      return;
    }
    sendZap(sats);
  };

  const copyInvoice = () => {
    if (invoice) {
      navigator.clipboard.writeText(invoice);
      toast("Invoice copied to clipboard", "success");
    }
  };

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <button
        onClick={() => {
          if (!lud16) {
            toast("This user hasn't set a lightning address", "info");
            return;
          }
          if (!pubkey || !signer) {
            toast("Sign in to send zaps", "info");
            return;
          }
          setMenuOpen(!menuOpen);
          setInvoice(null);
        }}
        className={`btn btn-sm ${menuOpen ? "bg-orange/10 border-orange/30 text-orange" : ""}`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-orange">
          <path d="M9.504 1.132a.75.75 0 0 1 .37.98L7.752 7h4.498a.75.75 0 0 1 .58 1.228l-6 7.25a.75.75 0 0 1-1.334-.58L7.248 9H2.75a.75.75 0 0 1-.58-1.228l6-7.25a.75.75 0 0 1 1.334.61Z" />
        </svg>
        {zapCount > 0 ? (
          <>
            <span>{formatSats(totalMsats)} sats</span>
            <span className="Counter">{zapCount}</span>
          </>
        ) : (
          <span>Zap</span>
        )}
      </button>

      {menuOpen && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-bg-secondary border border-border rounded-lg shadow-lg z-30 animate-fadeIn">
          {!invoice ? (
            <div className="p-3">
              <div className="text-xs text-text-muted mb-2 flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                Send sats to {lud16}
              </div>

              {/* Preset amounts */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {PRESET_AMOUNTS.map((sats) => (
                  <button
                    key={sats}
                    onClick={() => sendZap(sats)}
                    disabled={sending || !lnurlInfo}
                    className="px-2.5 py-1.5 text-xs rounded-md border border-border bg-bg-primary text-text-primary hover:border-orange hover:text-orange cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {sats} sats
                  </button>
                ))}
              </div>

              {/* Custom amount */}
              <div className="flex gap-1.5 mb-2">
                <input
                  type="number"
                  min="1"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="Custom sats"
                  className="flex-1 bg-bg-primary border border-border rounded-md px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-orange"
                  onKeyDown={(e) => e.key === "Enter" && handleCustomSend()}
                />
                <button
                  onClick={handleCustomSend}
                  disabled={sending || !lnurlInfo || !customAmount}
                  className="px-3 py-1.5 text-xs bg-orange text-white rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
                >
                  {sending ? "..." : "Zap"}
                </button>
              </div>

              {/* Optional comment */}
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment (optional)"
                className="w-full bg-bg-primary border border-border rounded-md px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-orange"
              />

              {!lnurlInfo && (
                <div className="flex items-center justify-center py-2 mt-2">
                  <div className="w-3 h-3 border-2 border-orange border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-text-muted ml-2">Resolving lightning address...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3">
              <div className="text-xs text-text-secondary mb-2 font-medium">Pay this invoice with your wallet:</div>

              {/* Invoice display */}
              <div
                onClick={copyInvoice}
                className="bg-bg-primary border border-border rounded-md p-2 text-[10px] font-mono text-text-muted break-all cursor-pointer hover:border-orange max-h-20 overflow-y-auto"
                title="Click to copy"
              >
                {invoice}
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  onClick={copyInvoice}
                  className="flex-1 px-3 py-1.5 text-xs border border-border rounded-md bg-bg-primary text-text-primary hover:border-text-muted cursor-pointer"
                >
                  Copy Invoice
                </button>
                <a
                  href={/^ln(bc|tb|tbs)1[a-z0-9]+$/i.test(invoice) ? `lightning:${invoice}` : "#"}
                  className="flex-1 px-3 py-1.5 text-xs bg-orange text-white rounded-md text-center no-underline hover:brightness-110"
                >
                  Open Wallet
                </a>
              </div>

              <button
                onClick={() => setInvoice(null)}
                className="w-full mt-2 text-xs text-text-muted hover:text-text-secondary bg-transparent border-0 cursor-pointer"
              >
                Back
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
