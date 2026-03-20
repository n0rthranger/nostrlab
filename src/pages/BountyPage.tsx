import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  pool,
  fetchProfiles,
  fetchBountyUpdates,
  publishBountyClaim,
  publishBountyPayment,
  resolveLud16,
  requestZapInvoice,
  shortenKey,
  timeAgo,
  repoAddress,
  signWith,
  DEFAULT_RELAYS,
} from "../lib/nostr";
import type { LnurlPayInfo } from "../lib/nostr";
import { BOUNTY } from "../types/nostr";
import type { BountyEvent, UserProfile } from "../types/nostr";
import { useAuth } from "../hooks/useAuth";
import { useWallet } from "../hooks/useWallet";
import { useToast } from "../components/Toast";

export default function BountyPage() {
  const { pubkey: repoPubkey, identifier } = useParams();
  const { signer, pubkey: authPubkey } = useAuth();
  const { connected: nwcConnected, payInvoice: nwcPayInvoice } = useWallet();
  const { toast } = useToast();
  const [bounties, setBounties] = useState<BountyEvent[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [newAmount, setNewAmount] = useState("");
  const [newContent, setNewContent] = useState("");
  const [creating, setCreating] = useState(false);

  // Claim/pay state
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimMessage, setClaimMessage] = useState("");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payInvoice, setPayInvoice] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const addr = repoPubkey && identifier ? repoAddress(repoPubkey, identifier) : "";

  useEffect(() => {
    if (!addr) return;
    let cancelled = false;

    pool.querySync(DEFAULT_RELAYS, { kinds: [BOUNTY], "#a": [addr] }).then(async (events) => {
      try {
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

        // Fetch status updates (claims/payments) for all bounties
        try {
          const bountyIds = parsed.map((b) => b.id);
          const updates = await fetchBountyUpdates(bountyIds);
          for (const b of parsed) {
            const update = updates.get(b.id);
            if (update) {
              b.status = update.status;
              b.claimedBy = update.claimedBy;
            }
          }
        } catch { /* skip status updates on failure */ }

        setBounties(parsed);
        const allPubkeys = [...new Set([
          ...parsed.map((b) => b.pubkey),
          ...parsed.filter((b) => b.claimedBy).map((b) => b.claimedBy!),
        ])];
        if (allPubkeys.length > 0) {
          const profs = await fetchProfiles(allPubkeys);
          if (!cancelled) setProfiles(profs);
        }
      } catch { /* ensure loading clears */ }
      if (!cancelled) setLoading(false);
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

  const handleClaim = async (bounty: BountyEvent) => {
    if (!signer || !authPubkey) return;
    setActionLoading(true);
    try {
      await publishBountyClaim(signer, {
        bountyId: bounty.id,
        bountyPubkey: bounty.pubkey,
        repoAddress: bounty.repoAddress,
        content: claimMessage || "I'd like to work on this bounty",
      });
      toast("Bounty claimed! The poster will be notified.", "success");
      setBounties((prev) => prev.map((b) =>
        b.id === bounty.id ? { ...b, status: "claimed" as const, claimedBy: authPubkey } : b
      ));
      setClaimingId(null);
      setClaimMessage("");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to claim bounty", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePay = async (bounty: BountyEvent) => {
    if (!signer || !bounty.claimedBy) return;
    setActionLoading(true);
    try {
      // Resolve claimant's lightning address
      const claimantProfs = await fetchProfiles([bounty.claimedBy]);
      const claimantProfile = claimantProfs.get(bounty.claimedBy);
      const lud16 = claimantProfile?.lud16;

      if (!lud16) {
        toast("Claimant hasn't set a lightning address. Contact them directly to pay.", "error");
        setActionLoading(false);
        return;
      }

      let lnurlInfo: LnurlPayInfo;
      try {
        lnurlInfo = await resolveLud16(lud16);
      } catch {
        toast("Could not resolve claimant's lightning address", "error");
        setActionLoading(false);
        return;
      }

      const amountMsats = bounty.amountSats * 1000;
      const bolt11 = await requestZapInvoice(signer, {
        recipientPubkey: bounty.claimedBy,
        targetId: bounty.id,
        amountMsats,
        lnurlPayInfo: lnurlInfo,
        content: `Bounty payment: ${bounty.content}`,
      });

      // Try NWC first
      if (nwcConnected) {
        try {
          await nwcPayInvoice(bolt11);
          await markPaid(bounty);
          return;
        } catch { /* fall through */ }
      }

      // Try WebLN
      if (window.webln) {
        try {
          await window.webln.enable();
          await window.webln.sendPayment(bolt11);
          await markPaid(bounty);
          return;
        } catch { /* fall through */ }
      }

      // Fallback: show invoice
      setPayingId(bounty.id);
      setPayInvoice(bolt11);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to create payment", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const markPaid = async (bounty: BountyEvent) => {
    if (!signer || !bounty.claimedBy) return;
    await publishBountyPayment(signer, {
      bountyId: bounty.id,
      claimantPubkey: bounty.claimedBy,
      repoAddress: bounty.repoAddress,
      content: "Bounty paid!",
    });
    toast("Bounty paid! Thank you for supporting open source.", "success");
    setBounties((prev) => prev.map((b) =>
      b.id === bounty.id ? { ...b, status: "paid" as const } : b
    ));
    setPayingId(null);
    setPayInvoice(null);
  };

  const handleMarkPaidManual = async (bounty: BountyEvent) => {
    setActionLoading(true);
    try {
      await markPaid(bounty);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to mark as paid", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const copyInvoice = () => {
    if (payInvoice) {
      navigator.clipboard.writeText(payInvoice);
      toast("Invoice copied to clipboard", "success");
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
              &#x26A1; {totalOpen.toLocaleString()} sats in open bounties
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
                  min="1"
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
            const claimant = b.claimedBy ? profiles.get(b.claimedBy) : undefined;
            const statusColor = b.status === "open" ? "text-green" : b.status === "paid" ? "text-accent" : "text-orange";
            const isOwner = authPubkey === b.pubkey;
            const isClaimed = b.status === "claimed";
            const isOpen = b.status === "open";
            const canClaim = signer && isOpen && !isOwner;
            const canPay = signer && isClaimed && isOwner;

            return (
              <div key={b.id} className="Box-row">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    <span className="text-orange font-bold text-sm">&#x26A1; {b.amountSats.toLocaleString()}</span>
                    <span className="text-xs text-text-muted ml-1">sats</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-text-primary">{b.content || "(no description)"}</div>
                    <div className="text-xs text-text-muted mt-0.5">
                      <span className={`font-medium ${statusColor}`}>{b.status}</span>
                      {" · "}posted by {author?.name ?? shortenKey(b.pubkey)} · {timeAgo(b.createdAt)}
                      {b.claimedBy && (
                        <> · claimed by {claimant?.name ?? shortenKey(b.claimedBy)}</>
                      )}
                    </div>

                    {/* Claim form */}
                    {claimingId === b.id && (
                      <div className="mt-3 flex gap-2 items-end">
                        <div className="flex-1">
                          <label className="text-[10px] text-text-muted block mb-1">Message to bounty poster</label>
                          <input
                            type="text"
                            value={claimMessage}
                            onChange={(e) => setClaimMessage(e.target.value)}
                            placeholder="I'd like to work on this bounty"
                            className="w-full bg-bg-primary border border-border rounded-md px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
                          />
                        </div>
                        <button
                          onClick={() => handleClaim(b)}
                          disabled={actionLoading}
                          className="btn btn-primary btn-sm"
                        >
                          {actionLoading ? "..." : "Submit Claim"}
                        </button>
                        <button
                          onClick={() => { setClaimingId(null); setClaimMessage(""); }}
                          className="btn btn-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Pay invoice display */}
                    {payingId === b.id && payInvoice && (
                      <div className="mt-3 p-3 bg-bg-primary border border-border rounded-lg">
                        <div className="text-xs text-text-secondary mb-2 font-medium">Pay this invoice to complete the bounty:</div>
                        <div
                          onClick={copyInvoice}
                          className="bg-bg-secondary border border-border rounded-md p-2 text-[10px] font-mono text-text-muted break-all cursor-pointer hover:border-orange max-h-16 overflow-y-auto mb-2"
                          title="Click to copy"
                        >
                          {payInvoice}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={copyInvoice} className="btn btn-sm flex-1">Copy Invoice</button>
                          <a
                            href={/^ln(bc|tb|tbs)1[a-z0-9]+$/i.test(payInvoice) ? `lightning:${payInvoice}` : "#"}
                            className="btn btn-sm flex-1 text-center no-underline bg-orange text-white hover:brightness-110"
                          >
                            Open Wallet
                          </a>
                        </div>
                        <button
                          onClick={() => handleMarkPaidManual(b)}
                          disabled={actionLoading}
                          className="btn btn-sm mt-2 w-full text-green"
                        >
                          {actionLoading ? "..." : "I've paid — mark as complete"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="shrink-0 flex gap-1.5">
                    {canClaim && claimingId !== b.id && (
                      <button
                        onClick={() => setClaimingId(b.id)}
                        className="btn btn-sm text-green"
                      >
                        Claim
                      </button>
                    )}
                    {canPay && payingId !== b.id && (
                      <button
                        onClick={() => handlePay(b)}
                        disabled={actionLoading}
                        className="btn btn-primary btn-sm"
                      >
                        {actionLoading ? "..." : "Pay"}
                      </button>
                    )}
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
