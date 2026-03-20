import { useState, useEffect } from "react";
import { pool, DEFAULT_RELAYS, timeAgo, shortenKey } from "../lib/nostr";
import type { UserProfile } from "../types/nostr";
import ZapButton from "./ZapButton";

interface Props {
  repoPubkey: string;
  repoAddress: string;
  profiles: Map<string, UserProfile>;
}

interface ZapEntry {
  id: string;
  senderPubkey: string;
  amountSats: number;
  createdAt: number;
}

const FUNDING_TIERS = [
  { label: "Buy me a coffee", sats: 1000, emoji: "coffee" },
  { label: "Supporter", sats: 5000, emoji: "star" },
  { label: "Sponsor", sats: 21000, emoji: "lightning" },
];

function getTagValue(event: { tags?: string[][] }, tag: string): string | undefined {
  const found = event.tags?.find((t: string[]) => t[0] === tag);
  return found ? found[1] : undefined;
}

export default function SponsorTab({ repoPubkey, repoAddress, profiles }: Props) {
  const [recentZaps, setRecentZaps] = useState<ZapEntry[]>([]);
  const [loadingZaps, setLoadingZaps] = useState(true);

  const maintainer = profiles.get(repoPubkey);
  const maintainerName = maintainer?.name ?? shortenKey(repoPubkey);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingZaps(true);
      try {
        const events = await pool.querySync(DEFAULT_RELAYS, {
          kinds: [9735],
          "#a": [repoAddress],
          limit: 20,
        });
        if (cancelled) return;
        const zaps: ZapEntry[] = [];
        for (const e of events) {
          let amountMsats = 0;
          let senderPubkey = "";
          const descTag = getTagValue(e, "description");
          if (descTag) {
            try {
              const desc = JSON.parse(descTag);
              senderPubkey = desc.pubkey || "";
              const amountTag = desc.tags?.find((t: string[]) => t[0] === "amount");
              if (amountTag) {
                const parsed = parseInt(amountTag[1], 10);
                if (Number.isFinite(parsed) && parsed >= 0) amountMsats = parsed;
              }
            } catch { /* skip */ }
          }
          if (amountMsats > 0) {
            zaps.push({
              id: e.id,
              senderPubkey,
              amountSats: Math.floor(amountMsats / 1000),
              createdAt: e.created_at,
            });
          }
        }
        zaps.sort((a, b) => b.createdAt - a.createdAt);
        setRecentZaps(zaps);
        setLoadingZaps(false);
      } catch {
        if (!cancelled) setLoadingZaps(false);
      }
    })();
    return () => { cancelled = true; };
  }, [repoAddress]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Maintainer profile */}
      <div className="Box">
        <div className="Box-header py-2 px-4">
          <h3 className="text-sm font-medium">Maintainer</h3>
        </div>
        <div className="p-4 flex items-center gap-4">
          {maintainer?.picture ? (
            <img
              src={maintainer.picture}
              alt=""
              className="w-14 h-14 rounded-full border border-border"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-bg-tertiary flex items-center justify-center text-text-muted text-lg border border-border">
              {maintainerName[0].toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-text-primary">{maintainerName}</div>
            {maintainer?.about && (
              <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{maintainer.about}</p>
            )}
            {maintainer?.lud16 && (
              <div className="flex items-center gap-1.5 mt-1 text-xs text-orange">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                {maintainer.lud16}
              </div>
            )}
          </div>
          <ZapButton
            targetId={repoAddress}
            targetPubkey={repoPubkey}
            lud16={maintainer?.lud16}
          />
        </div>
      </div>

      {/* Funding tiers */}
      <div>
        <h3 className="text-sm font-medium mb-3">Support this project</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {FUNDING_TIERS.map((tier) => (
            <div
              key={tier.label}
              className="border border-border rounded-xl p-4 bg-bg-secondary hover:border-orange/50 transition-colors"
            >
              <div className="text-center">
                <div className="text-2xl mb-2">
                  {tier.emoji === "coffee" && (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-orange">
                      <path d="M17 8h1a4 4 0 1 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
                      <line x1="6" y1="2" x2="6" y2="4" /><line x1="10" y1="2" x2="10" y2="4" /><line x1="14" y1="2" x2="14" y2="4" />
                    </svg>
                  )}
                  {tier.emoji === "star" && (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="mx-auto text-orange">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  )}
                  {tier.emoji === "lightning" && (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="mx-auto text-orange">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                  )}
                </div>
                <div className="font-medium text-text-primary text-sm">{tier.label}</div>
                <div className="text-orange font-semibold mt-1">{tier.sats.toLocaleString()} sats</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent zap receipts */}
      <div className="Box">
        <div className="Box-header py-2 px-4">
          <h3 className="text-sm font-medium">Recent Supporters</h3>
        </div>
        {loadingZaps ? (
          <div className="p-4 text-center text-text-muted text-sm">
            <div className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin mb-2" />
            <p>Loading zap receipts...</p>
          </div>
        ) : recentZaps.length === 0 ? (
          <div className="p-6 text-center text-text-muted text-sm">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 text-text-muted">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <p>No zaps yet. Be the first to support this project!</p>
          </div>
        ) : (
          <div>
            {recentZaps.map((zap) => {
              const senderProfile = profiles.get(zap.senderPubkey);
              const senderName = senderProfile?.name ?? (zap.senderPubkey ? shortenKey(zap.senderPubkey) : "Anonymous");
              return (
                <div key={zap.id} className="Box-row flex items-center gap-3">
                  {senderProfile?.picture ? (
                    <img
                      src={senderProfile.picture}
                      alt=""
                      className="w-6 h-6 rounded-full border border-border"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-bg-tertiary flex items-center justify-center text-text-muted text-[10px] border border-border">
                      {senderName[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-sm">
                    <span className="text-text-primary font-medium">{senderName}</span>
                    <span className="text-text-muted"> zapped </span>
                    <span className="text-orange font-medium">{zap.amountSats.toLocaleString()} sats</span>
                    <span className="text-text-muted"> {timeAgo(zap.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
