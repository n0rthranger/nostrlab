import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  pool,
  fetchProfiles,
  shortenKey,
  timeAgo,
  repoAddress,
  signWith,
  DEFAULT_RELAYS,
} from "../lib/nostr";
import { BOUNTY } from "../types/nostr";
import type { BountyEvent, UserProfile } from "../types/nostr";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";

export default function BountyPage() {
  const { pubkey: repoPubkey, identifier } = useParams();
  const { signer, pubkey: authPubkey } = useAuth();
  const { toast } = useToast();
  const [bounties, setBounties] = useState<BountyEvent[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [newAmount, setNewAmount] = useState("");
  const [newContent, setNewContent] = useState("");
  const [creating, setCreating] = useState(false);

  const addr = repoPubkey && identifier ? repoAddress(repoPubkey, identifier) : "";

  useEffect(() => {
    if (!addr) return;
    let cancelled = false;

    pool.querySync(DEFAULT_RELAYS, { kinds: [BOUNTY], "#a": [addr] }).then(async (events) => {
      if (cancelled) return;
      const parsed: BountyEvent[] = events
        .filter((e) => e.tags.some((t) => t[0] === "amount" && t[1] && parseInt(t[1], 10) > 0))
        .map((e) => ({
          id: e.id,
          pubkey: e.pubkey,
          content: e.content,
          repoAddress: e.tags.find((t) => t[0] === "a")?.[1] ?? "",
          issueId: e.tags.find((t) => t[0] === "e")?.[1],
          amountSats: parseInt(e.tags.find((t) => t[0] === "amount")?.[1] ?? "0", 10),
          status: (e.tags.find((t) => t[0] === "status")?.[1] as BountyEvent["status"]) ?? "open",
          createdAt: e.created_at,
        })).sort((a, b) => b.createdAt - a.createdAt);

      setBounties(parsed);
      const pubkeys = [...new Set(parsed.map((b) => b.pubkey))];
      const profs = await fetchProfiles(pubkeys);
      if (!cancelled) setProfiles(profs);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [addr]);

  const handleCreate = async () => {
    if (!signer || !addr || !newAmount) return;
    setCreating(true);
    try {
      const event = await signWith(signer, {
        kind: BOUNTY,
        content: newContent,
        tags: [
          ["a", addr],
          ["amount", newAmount],
          ["status", "open"],
          ...(repoPubkey ? [["p", repoPubkey]] : []),
        ],
        created_at: Math.floor(Date.now() / 1000),
      });
      await Promise.allSettled(pool.publish(DEFAULT_RELAYS, event));
      toast("Bounty created!", "success");
      const newBounty: BountyEvent = {
        id: event.id,
        pubkey: authPubkey!,
        content: newContent,
        repoAddress: addr,
        amountSats: parseInt(newAmount) || 0,
        status: "open",
        createdAt: event.created_at,
      };
      setBounties((prev) => [newBounty, ...prev]);
      setNewAmount("");
      setNewContent("");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to create bounty", "error");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p>Loading bounties...</p>
      </div>
    );
  }

  const totalOpen = bounties.filter((b) => b.status === "open").reduce((sum, b) => sum + b.amountSats, 0);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-3">
        <Link to={`/repo/${repoPubkey}/${identifier}`} className="text-sm text-accent hover:underline">
          &larr; Back to {identifier}
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Bounties</h1>
          {totalOpen > 0 && (
            <p className="text-sm text-orange mt-1">
              ⚡ {totalOpen.toLocaleString()} sats in open bounties
            </p>
          )}
        </div>
      </div>

      {/* Create bounty */}
      {signer && (
        <div className="Box mb-6">
          <div className="Box-header py-2 px-4">
            <h2 className="text-sm font-semibold">Post a bounty</h2>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex gap-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">Amount (sats)</label>
                <input
                  type="number"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="1000"
                  className="w-32 bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-text-muted block mb-1">Description</label>
                <input
                  type="text"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="What needs to be done?"
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </div>
            <button onClick={handleCreate} disabled={creating || !newAmount} className="btn btn-primary">
              {creating ? "Creating..." : "Post Bounty"}
            </button>
          </div>
        </div>
      )}

      {/* Bounty list */}
      {bounties.length === 0 ? (
        <div className="Blankslate Box">
          <p>No bounties posted yet</p>
        </div>
      ) : (
        <div className="Box">
          {bounties.map((b) => {
            const author = profiles.get(b.pubkey);
            const statusColor = b.status === "open" ? "text-green" : b.status === "paid" ? "text-purple" : "text-orange";
            return (
              <div key={b.id} className="Box-row flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  <span className="text-orange font-bold text-sm">⚡ {b.amountSats.toLocaleString()}</span>
                  <span className="text-xs text-text-muted ml-1">sats</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-text-primary">{b.content || "(no description)"}</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    <span className={`font-medium ${statusColor}`}>{b.status}</span>
                    {" · "}posted by {author?.name ?? shortenKey(b.pubkey)} · {timeAgo(b.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
