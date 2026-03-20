import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  pool,
  fetchProfiles,
  shortenKey,
  timeAgo,
  DEFAULT_RELAYS,
} from "../lib/nostr";
import { BOUNTY, REPO_ANNOUNCEMENT } from "../types/nostr";
import type { BountyEvent, UserProfile } from "../types/nostr";

interface EnrichedBounty extends BountyEvent {
  repoName: string;
  repoIdentifier: string;
  repoPubkey: string;
}

export default function BountyHuntPage() {
  const [bounties, setBounties] = useState<EnrichedBounty[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"open" | "claimed" | "paid" | "all">("open");
  const [sortBy, setSortBy] = useState<"recent" | "amount">("amount");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Fetch all bounties across all repos
      const events = await pool.querySync(DEFAULT_RELAYS, { kinds: [BOUNTY], limit: 200 });
      if (cancelled) return;

      const parsed: EnrichedBounty[] = events.map((e) => {
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

      // Fetch repo names for each unique repo address
      const repoAddrs = [...new Set(parsed.map((b) => b.repoAddress).filter(Boolean))];
      const repoNames = new Map<string, string>();

      if (repoAddrs.length > 0) {
        const repoFilters = repoAddrs.map((addr) => {
          const [, pubkey, identifier] = addr.split(":");
          return { kinds: [REPO_ANNOUNCEMENT], authors: [pubkey], "#d": [identifier], limit: 1 };
        });
        // Batch fetch repos (max 10 at a time)
        for (let i = 0; i < repoFilters.length; i += 10) {
          const batch = repoFilters.slice(i, i + 10);
          const repoEvents = await pool.querySync(DEFAULT_RELAYS, ...batch);
          for (const re of repoEvents) {
            const addr = `30617:${re.pubkey}:${re.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
            const name = re.tags.find((t) => t[0] === "name")?.[1] ?? re.tags.find((t) => t[0] === "d")?.[1] ?? "";
            repoNames.set(addr, name);
          }
        }
      }

      // Enrich bounties with repo names
      for (const b of parsed) {
        b.repoName = repoNames.get(b.repoAddress) || b.repoIdentifier;
      }

      parsed.sort((a, b) => b.amountSats - a.amountSats);
      setBounties(parsed);

      // Fetch profiles
      const pubkeys = [...new Set(parsed.map((b) => b.pubkey))];
      if (pubkeys.length > 0) {
        const profs = await fetchProfiles(pubkeys);
        if (!cancelled) setProfiles(profs);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

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
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          <span className="text-orange">&#x26A1;</span> Bounty Hunt
        </h1>
        <p className="text-text-secondary text-sm">
          Find open bounties across all repositories. Earn sats by contributing code.
        </p>
      </div>

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
              ? "No open bounties right now. Check back later or post one on your repo!"
              : "No bounties match your filter."}
          </p>
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
            const statusColor = b.status === "open" ? "text-green" : b.status === "paid" ? "text-accent" : "text-orange";
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
                      <span className="text-border">|</span>
                      <span>{timeAgo(b.createdAt)}</span>
                    </div>
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
