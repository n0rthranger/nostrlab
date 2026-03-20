import { useEffect, useState, useCallback } from "react";
import type { Event } from "nostr-tools";
import { Link } from "react-router-dom";
import { fetchRepos, fetchProfiles, parseRepoAnnouncement, DEFAULT_RELAYS } from "../lib/nostr";
import type { RepoAnnouncement, UserProfile } from "../types/nostr";
import { REPO_ANNOUNCEMENT } from "../types/nostr";
import RepoCard from "../components/RepoCard";
import NostrLabLogo from "../components/NostrLabLogo";
import { useAuth } from "../hooks/useAuth";
import { useRelays } from "../hooks/useRelays";
import { useLiveEvents } from "../hooks/useSubscription";
import OnboardingTips from "../components/OnboardingTips";

export default function ExplorePage() {
  const { pubkey } = useAuth();
  const { globalRelays } = useRelays();
  const [repos, setRepos] = useState<RepoAnnouncement[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "stars">("recent");
  const [tagFilter, setTagFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const repos = await fetchRepos(globalRelays);
      if (cancelled) return;
      const sorted = repos.sort((a, b) => b.createdAt - a.createdAt);
      setRepos(sorted);
      const pubkeys = [...new Set(sorted.map((r) => r.pubkey))];
      const profs = await fetchProfiles(pubkeys, globalRelays);
      if (cancelled) return;
      setProfiles(profs);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [globalRelays]);

  // Live subscription for new repos
  const repoParser = useCallback((event: Event) => parseRepoAnnouncement(event), []);
  const [sinceTs] = useState(() => Math.floor(Date.now() / 1000));
  const { events: liveRepos } = useLiveEvents(
    globalRelays.length > 0 ? globalRelays : DEFAULT_RELAYS,
    [{ kinds: [REPO_ANNOUNCEMENT], since: sinceTs }],
    repoParser,
  );

  // Merge live repos
  const allRepos = (() => {
    const ids = new Set(repos.map((r) => r.id));
    const merged = [...repos];
    for (const lr of liveRepos) { if (!ids.has(lr.id)) { merged.push(lr); ids.add(lr.id); } }
    return merged;
  })();

  // Hide unlisted repos from Explore
  const listed = allRepos.filter((r) => !r.tags.includes("unlisted"));

  // Collect all unique tags for the filter dropdown
  const allTags = [...new Set(listed.flatMap((r) => r.tags))].sort();

  let filtered = listed;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q))
    );
  }
  if (tagFilter) {
    filtered = filtered.filter((r) => r.tags.includes(tagFilter));
  }

  // Sort
  filtered = [...filtered].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    return b.createdAt - a.createdAt; // "recent" is default
  });

  return (
    <div>
      {/* Hero for visitors */}
      {!pubkey && (
        <div className="hero-hacker data-stream-bg text-center py-20 md:py-28 mb-10 border border-border/30 rounded-2xl noise-overlay relative">
          {/* Floating orbs */}
          <div className="orb orb-purple w-64 h-64 -top-20 -left-20" style={{ animationDuration: '10s' }} />
          <div className="orb orb-cyan w-48 h-48 top-10 -right-10" style={{ animationDuration: '12s', animationDelay: '2s' }} />
          <div className="orb orb-purple w-32 h-32 bottom-10 left-1/3" style={{ animationDuration: '8s', animationDelay: '4s' }} />

          <div className="relative z-10">
            <div className="animate-flicker-in">
              <div className="inline-block rounded-full glow-ring p-1 mb-6">
                <NostrLabLogo size={80} className="mx-auto" style={{ borderRadius: '50%' }} />
              </div>
            </div>
            <div className="animate-hacker-fade-up stagger-1">
              <p className="text-[11px] font-mono text-cyan tracking-[0.4em] uppercase mb-4 opacity-60">// initializing protocol</p>
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-5 animate-hacker-fade-up stagger-2 tracking-tight">
              <span className="glitch-text text-text-primary">Code collaboration,</span>
              <br className="hidden md:block" />{" "}
              <span className="hero-title-gradient">
                decentralized
              </span>
            </h1>
            <p className="text-text-secondary text-base md:text-lg max-w-2xl mx-auto mb-10 animate-hacker-fade-up stagger-3 leading-relaxed px-4">
              NostrLab is a decentralized alternative to GitHub built on the Nostr protocol.
              Your repos, issues, and patches live on relays — not corporate servers.
            </p>
            <div className="flex items-center justify-center gap-4 animate-hacker-fade-up stagger-4">
              <Link to="/login" className="btn btn-primary px-6 py-2.5 text-base no-underline hover:no-underline animate-pulse-glow rounded-xl" style={{ animationDuration: '3s' }}>
                <span className="font-mono">&gt;</span> Get Started
              </Link>
              <a
                href="https://github.com/nostr-protocol/nips/blob/master/34.md"
                target="_blank"
                rel="noopener noreferrer"
                className="btn px-6 py-2.5 text-base no-underline hover:no-underline neon-border-animated rounded-xl"
              >
                Learn NIP-34
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 max-w-3xl mx-auto text-left px-4">
              <div className="Box p-6 feature-card animate-hacker-fade-up stagger-5 rounded-xl">
                <div className="w-10 h-10 rounded-lg bg-green/10 border border-green/20 flex items-center justify-center mb-4">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <h3 className="font-semibold text-sm mb-2 glitch-text">Own Your Identity</h3>
                <p className="text-xs text-text-secondary leading-relaxed">Your cryptographic keys are your account. No email, no password, no company can lock you out.</p>
                <div className="mt-4 font-mono text-[10px] text-cyan opacity-30">// nostr keypair auth</div>
              </div>
              <div className="Box p-6 feature-card animate-hacker-fade-up stagger-6 rounded-xl">
                <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                </div>
                <h3 className="font-semibold text-sm mb-2 glitch-text">Censorship Resistant</h3>
                <p className="text-xs text-text-secondary leading-relaxed">Your repos are announced to multiple relays. No single point of failure or control.</p>
                <div className="mt-4 font-mono text-[10px] text-cyan opacity-30">// distributed mesh</div>
              </div>
              <div className="Box p-6 feature-card animate-hacker-fade-up stagger-7 rounded-xl">
                <div className="w-10 h-10 rounded-lg bg-purple/10 border border-purple/20 flex items-center justify-center mb-4">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                </div>
                <h3 className="font-semibold text-sm mb-2 glitch-text">Git Compatible</h3>
                <p className="text-xs text-text-secondary leading-relaxed">Submit patches, open issues, review PRs — all using standard git workflows over Nostr events.</p>
                <div className="mt-4 font-mono text-[10px] text-cyan opacity-30">// NIP-34 protocol</div>
              </div>
            </div>

            {/* Onboarding tips for visitors */}
            <div className="mt-12 max-w-3xl mx-auto px-4">
              <OnboardingTips />
            </div>
          </div>
        </div>
      )}

      {/* Repo list header */}
      <div className="flex items-center justify-between mb-5 animate-hacker-fade-up">
        <h2 className="text-lg font-semibold glitch-text flex items-center gap-2.5">
          <span className="text-cyan font-mono text-xs opacity-50">&gt;</span>
          {pubkey ? "Explore Repositories" : "Recent Repositories"}
        </h2>
        {pubkey && (
          <Link to="/new" className="btn btn-primary btn-sm no-underline hover:no-underline">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
            </svg>
            New
          </Link>
        )}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            width="16" height="16" viewBox="0 0 16 16" fill="currentColor"
          >
            <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
          </svg>
          <input
            type="text"
            placeholder="Find a repository..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="subnav-search-input w-full"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary bg-transparent border-0 cursor-pointer text-xs"
            >
              Clear
            </button>
          )}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "recent" | "name" | "stars")}
          className="bg-bg-secondary/50 backdrop-blur-sm border border-border rounded-xl px-3 py-2 text-sm text-text-primary cursor-pointer"
        >
          <option value="recent">Recently updated</option>
          <option value="name">Name</option>
        </select>

        {allTags.length > 0 && (
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="bg-bg-secondary/50 backdrop-blur-sm border border-border rounded-xl px-3 py-2 text-sm text-text-primary cursor-pointer"
          >
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="Blankslate animate-flicker-in">
          <NostrLabLogo size={48} className="mx-auto mb-4 animate-pulse-glow" style={{ borderRadius: '50%' }} />
          <p className="text-cyan text-sm font-mono terminal-cursor">Connecting to relays</p>
          <p className="text-text-muted text-xs font-mono mt-2 opacity-50">// scanning nostr network...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="Blankslate Box">
          <svg width="40" height="40" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted mx-auto mb-3">
            <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
          </svg>
          <h3 className="text-lg font-medium text-text-primary mb-1">
            {search ? "No matching repositories" : "No repositories found yet"}
          </h3>
          <p>
            {search
              ? "Try different keywords or clear your search"
              : "Be the first to announce a repository on Nostr!"}
          </p>
          {search && (
            <button onClick={() => setSearch("")} className="btn btn-sm mt-4">
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="Box repo-list-container neon-border-animated rounded-2xl">
          <div className="Box-header flex items-center justify-between py-3 px-5 rounded-t-2xl">
            <span className="text-sm text-text-secondary font-mono">
              <span className="text-cyan">[</span>{filtered.length}<span className="text-cyan">]</span> {filtered.length === 1 ? "repository" : "repositories"}
              {search && ` matching "${search}"`}
            </span>
          </div>
          {filtered.map((repo, i) => (
            <div key={`${repo.pubkey}:${repo.identifier}`} className={`cyber-card-enhanced animate-hacker-slide stagger-${Math.min(i + 1, 8)}`}>
              <RepoCard
                repo={repo}
                authorName={profiles.get(repo.pubkey)?.name}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
