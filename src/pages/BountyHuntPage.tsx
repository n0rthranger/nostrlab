import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
import { BOUNTY, REPO_ANNOUNCEMENT } from "../types/nostr";
import type { BountyEvent, UserProfile, RepoAnnouncement } from "../types/nostr";
import { useAuth } from "../hooks/useAuth";
import { useWallet } from "../hooks/useWallet";
import { useToast } from "../components/Toast";

interface EnrichedBounty extends BountyEvent {
  repoName: string;
  repoIdentifier: string;
  repoPubkey: string;
}

export default function BountyHuntPage() {
  const { pubkey: authPubkey, signer } = useAuth();
  const { connected: nwcConnected, payInvoice: nwcPayInvoice } = useWallet();
  const { toast } = useToast();
  const [bounties, setBounties] = useState<EnrichedBounty[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"open" | "claimed" | "paid" | "all">("open");
  const [sortBy, setSortBy] = useState<"recent" | "amount">("amount");

  // Create bounty form state
  const [showForm, setShowForm] = useState(false);
  const [userRepos, setUserRepos] = useState<RepoAnnouncement[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newContent, setNewContent] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);

  // Claim/pay state
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimMessage, setClaimMessage] = useState("");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payInvoice, setPayInvoice] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const events = await pool.querySync(DEFAULT_RELAYS, { kinds: [BOUNTY], limit: 200 });
      if (cancelled) return;

      const parsed: EnrichedBounty[] = events
        .filter((e) => {
          const hasAmount = e.tags.some((t) => t[0] === "amount" && t[1] && parseInt(t[1], 10) > 0);
          const hasRepoAddr = e.tags.some((t) => t[0] === "a" && t[1]?.startsWith("30617:"));
          return hasAmount && hasRepoAddr;
        })
        .map((e) => {
          const repoAddr = e.tags.find((t) => t[0] === "a")?.[1] ?? "";
          const parts = repoAddr.split(":");
          return {
            id: e.id,
            pubkey: e.pubkey,
            content: e.content,
            repoAddress: repoAddr,
            repoName: "",
            repoIdentifier: parts[2] ?? "",
            repoPubkey: parts[1] ?? "",
            issueId: e.tags.find((t) => t[0] === "e")?.[1],
            amountSats: parseInt(e.tags.find((t) => t[0] === "amount")?.[1] ?? "0", 10),
            status: (e.tags.find((t) => t[0] === "status")?.[1] as BountyEvent["status"]) ?? "open",
            createdAt: e.created_at,
          };
        });

      // Fetch status updates (claims/payments)
      const bountyIds = parsed.map((b) => b.id);
      const updates = await fetchBountyUpdates(bountyIds);
      for (const b of parsed) {
        const update = updates.get(b.id);
        if (update) {
          b.status = update.status;
          b.claimedBy = update.claimedBy;
        }
      }

      // Fetch repo names
      const repoAddrs = [...new Set(parsed.map((b) => b.repoAddress).filter(Boolean))];
      const repoNames = new Map<string, string>();

      if (repoAddrs.length > 0) {
        const fetchPromises = repoAddrs.map(async (addr) => {
          const [, pubkey, identifier] = addr.split(":");
          if (!pubkey || !identifier) return;
          try {
            const events = await pool.querySync(DEFAULT_RELAYS, { kinds: [REPO_ANNOUNCEMENT], authors: [pubkey], "#d": [identifier], limit: 1 });
            for (const re of events) {
              const name = re.tags.find((t) => t[0] === "name")?.[1] ?? re.tags.find((t) => t[0] === "d")?.[1] ?? "";
              repoNames.set(addr, name);
            }
          } catch { /* skip */ }
        });
        await Promise.allSettled(fetchPromises);
      }

      for (const b of parsed) {
        b.repoName = repoNames.get(b.repoAddress) || b.repoIdentifier;
      }

      parsed.sort((a, b) => b.amountSats - a.amountSats);
      setBounties(parsed);

      const allPubkeys = [...new Set([
        ...parsed.map((b) => b.pubkey),
        ...parsed.filter((b) => b.claimedBy).map((b) => b.claimedBy!),
      ])];
      if (allPubkeys.length > 0) {
        const profs = await fetchProfiles(allPubkeys);
        if (!cancelled) setProfiles(profs);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  const handleOpenForm = async () => {
    setShowForm(true);
    if (userRepos.length > 0 || !authPubkey) return;
    setLoadingRepos(true);
    try {
      const events = await pool.querySync(DEFAULT_RELAYS, { kinds: [REPO_ANNOUNCEMENT], authors: [authPubkey] });
      const repos: RepoAnnouncement[] = events
        .map((e) => {
          const name = e.tags.find((t) => t[0] === "name")?.[1] ?? e.tags.find((t) => t[0] === "d")?.[1] ?? "";
          const identifier = e.tags.find((t) => t[0] === "d")?.[1] ?? "";
          return { id: e.id, pubkey: e.pubkey, identifier, name, description: "", cloneUrls: [], webUrls: [], tags: [], createdAt: e.created_at };
        })
        .filter((r) => r.name && r.identifier);
      setUserRepos(repos);
      if (repos.length > 0) setSelectedRepo(`${repos[0].pubkey}:${repos[0].identifier}`);
    } catch { /* ignore */ }
    setLoadingRepos(false);
  };

  const handleCreate = async () => {
    if (!signer || !selectedRepo || !newAmount) return;
    const [repoPubkey, repoIdentifier] = selectedRepo.split(":");
    const addr = repoAddress(repoPubkey, repoIdentifier);
    setCreating(true);
    try {
      const event = await signWith(signer, {
        kind: BOUNTY,
        content: newContent,
        tags: [
          ["a", addr],
          ["amount", newAmount],
          ["status", "open"],
          ["p", repoPubkey],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });
      await Promise.allSettled(pool.publish(DEFAULT_RELAYS, event));
      toast("Bounty created!", "success");

      const repo = userRepos.find((r) => r.pubkey === repoPubkey && r.identifier === repoIdentifier);
      const newBounty: EnrichedBounty = {
        id: event.id,
        pubkey: authPubkey!,
        content: newContent,
        repoAddress: addr,
        repoName: repo?.name ?? repoIdentifier,
        repoIdentifier,
        repoPubkey,
        amountSats: parseInt(newAmount) || 0,
        status: "open",
        createdAt: event.created_at,
      };
      setBounties((prev) => [newBounty, ...prev]);
      setShowForm(false);
      setNewAmount("");
      setNewContent("");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to create bounty", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleClaim = async (bounty: EnrichedBounty) => {
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

  const handlePay = async (bounty: EnrichedBounty) => {
    if (!signer || !bounty.claimedBy) return;
    setActionLoading(true);
    try {
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

      if (nwcConnected) {
        try {
          await nwcPayInvoice(bolt11);
          await markPaid(bounty);
          return;
        } catch { /* fall through */ }
      }

      if (window.webln) {
        try {
          await window.webln.enable();
          await window.webln.sendPayment(bolt11);
          await markPaid(bounty);
          return;
        } catch { /* fall through */ }
      }

      setPayingId(bounty.id);
      setPayInvoice(bolt11);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to create payment", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const markPaid = async (bounty: EnrichedBounty) => {
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

  const handleMarkPaidManual = async (bounty: EnrichedBounty) => {
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

  const filtered = bounties
    .filter((b) => statusFilter === "all" || b.status === statusFilter)
    .sort((a, b) => {
      if (sortBy === "amount") return b.amountSats - a.amountSats;
      return b.createdAt - a.createdAt;
    });

  const totalOpen = bounties.filter((b) => b.status === "open").reduce((sum, b) => sum + b.amountSats, 0);
  const openCount = bounties.filter((b) => b.status === "open").length;

  if (loading) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-orange border-t-transparent rounded-full animate-spin mb-3" />
        <p className="font-mono text-sm">Scanning relays for bounties...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">
            <span className="text-orange">&#x26A1;</span> Bounty Hunt
          </h1>
          <p className="text-text-secondary text-sm">
            Find open bounties across all repositories. Earn sats by contributing code.
          </p>
        </div>
        {signer && (
          <button
            onClick={showForm ? () => setShowForm(false) : handleOpenForm}
            className="btn btn-primary btn-sm shrink-0"
          >
            {showForm ? "Cancel" : "Post Bounty"}
          </button>
        )}
      </div>

      {/* Create bounty form */}
      {showForm && (
        <div className="Box mb-8">
          <div className="Box-header py-2 px-4">
            <h2 className="text-sm font-semibold">Post a bounty</h2>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Repository</label>
              {loadingRepos ? (
                <div className="text-sm text-text-muted py-2">Loading your repos...</div>
              ) : userRepos.length === 0 ? (
                <div className="text-sm text-text-muted py-2">
                  You don't have any repositories yet.{" "}
                  <Link to="/new" className="text-accent hover:underline no-underline">Create one first</Link>
                </div>
              ) : (
                <select
                  value={selectedRepo}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary cursor-pointer focus:outline-none focus:border-accent"
                >
                  {userRepos.map((r) => (
                    <option key={`${r.pubkey}:${r.identifier}`} value={`${r.pubkey}:${r.identifier}`}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
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
            <button
              onClick={handleCreate}
              disabled={creating || !newAmount || !selectedRepo || userRepos.length === 0}
              className="btn btn-primary"
            >
              {creating ? "Creating..." : "Post Bounty"}
            </button>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <div className="Box p-4 text-center">
          <div className="text-2xl font-bold text-orange">{totalOpen.toLocaleString()}</div>
          <div className="text-xs text-text-muted mt-1">sats available</div>
        </div>
        <div className="Box p-4 text-center">
          <div className="text-2xl font-bold text-green">{openCount}</div>
          <div className="text-xs text-text-muted mt-1">open bounties</div>
        </div>
        <div className="Box p-4 text-center hidden md:block">
          <div className="text-2xl font-bold text-accent">{bounties.length}</div>
          <div className="text-xs text-text-muted mt-1">total bounties</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="bg-bg-secondary/50 backdrop-blur-sm border border-border rounded-xl px-3 py-2 text-sm text-text-primary cursor-pointer"
        >
          <option value="open">Open</option>
          <option value="claimed">Claimed</option>
          <option value="paid">Paid</option>
          <option value="all">All</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="bg-bg-secondary/50 backdrop-blur-sm border border-border rounded-xl px-3 py-2 text-sm text-text-primary cursor-pointer"
        >
          <option value="amount">Highest reward</option>
          <option value="recent">Most recent</option>
        </select>
      </div>

      {/* Bounty list */}
      {filtered.length === 0 ? (
        <div className="Blankslate Box">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange mx-auto mb-3">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
          <h3 className="text-lg font-medium text-text-primary mb-1">No bounties found</h3>
          <p className="text-sm text-text-muted">
            {statusFilter === "open"
              ? "No open bounties right now. Be the first to post one!"
              : "No bounties match your filter."}
          </p>
          {signer && !showForm && (
            <button onClick={handleOpenForm} className="btn btn-primary btn-sm mt-4">
              Post a Bounty
            </button>
          )}
        </div>
      ) : (
        <div className="Box neon-border-animated rounded-2xl">
          <div className="Box-header py-3 px-5">
            <span className="text-sm text-text-secondary font-mono">
              <span className="text-orange">[</span>{filtered.length}<span className="text-orange">]</span> bounties
            </span>
          </div>
          {filtered.map((b) => {
            const author = profiles.get(b.pubkey);
            const claimant = b.claimedBy ? profiles.get(b.claimedBy) : undefined;
            const statusColor = b.status === "open" ? "text-green" : b.status === "paid" ? "text-accent" : "text-orange";
            const isOwner = authPubkey === b.pubkey;
            const isOpen = b.status === "open";
            const isClaimed = b.status === "claimed";
            const canClaim = signer && isOpen && !isOwner;
            const canPay = signer && isClaimed && isOwner;

            return (
              <div key={b.id} className="Box-row hover:bg-bg-tertiary/50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="shrink-0 text-right" style={{ minWidth: "90px" }}>
                    <span className="text-orange font-bold text-lg">{b.amountSats.toLocaleString()}</span>
                    <div className="text-[10px] text-text-muted font-mono">sats</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-text-primary mb-1">
                      {b.content || "(no description)"}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                      <span className={`font-semibold ${statusColor} uppercase text-[10px] tracking-wider`}>{b.status}</span>
                      <span className="text-border">|</span>
                      <Link
                        to={`/repo/${b.repoPubkey}/${b.repoIdentifier}/bounties`}
                        className="text-accent hover:underline no-underline"
                      >
                        {b.repoName || b.repoIdentifier}
                      </Link>
                      <span className="text-border">|</span>
                      <span>by {author?.name ?? shortenKey(b.pubkey)}</span>
                      {b.claimedBy && (
                        <>
                          <span className="text-border">|</span>
                          <span>claimed by {claimant?.name ?? shortenKey(b.claimedBy)}</span>
                        </>
                      )}
                      <span className="text-border">|</span>
                      <span>{timeAgo(b.createdAt)}</span>
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
