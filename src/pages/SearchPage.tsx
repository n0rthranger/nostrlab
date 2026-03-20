import { useState } from "react";
import { Link } from "react-router-dom";
import {
  pool,
  fetchProfiles,
  shortenKey,
  timeAgo,
  DEFAULT_RELAYS,
  npubFromPubkey,
} from "../lib/nostr";
import {
  REPO_ANNOUNCEMENT,
  ISSUE,
  CODE_SNIPPET,
  PROFILE_METADATA,
} from "../types/nostr";
import type { UserProfile } from "../types/nostr";

type ResultType = "repos" | "issues" | "users" | "snippets";

interface SearchResult {
  type: ResultType;
  id: string;
  title: string;
  description: string;
  pubkey: string;
  link: string;
  createdAt: number;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [filter, setFilter] = useState<ResultType | "all">("all");

  const handleSearch = async () => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    setLoading(true);
    setSearched(true);

    const [repos, issues, snippets, users] = await Promise.all([
      pool.querySync(DEFAULT_RELAYS, { kinds: [REPO_ANNOUNCEMENT], limit: 200 }),
      pool.querySync(DEFAULT_RELAYS, { kinds: [ISSUE], limit: 200 }),
      pool.querySync(DEFAULT_RELAYS, { kinds: [CODE_SNIPPET], limit: 200 }),
      pool.querySync(DEFAULT_RELAYS, { kinds: [PROFILE_METADATA], limit: 200 }),
    ]);

    const allResults: SearchResult[] = [];

    // Search repos
    for (const ev of repos) {
      const name = ev.tags.find((t) => t[0] === "name")?.[1] ?? ev.tags.find((t) => t[0] === "d")?.[1] ?? "";
      const desc = ev.tags.find((t) => t[0] === "description")?.[1] ?? "";
      const identifier = ev.tags.find((t) => t[0] === "d")?.[1] ?? "";
      if (name.toLowerCase().includes(q) || desc.toLowerCase().includes(q)) {
        allResults.push({
          type: "repos", id: ev.id, title: name, description: desc.slice(0, 100),
          pubkey: ev.pubkey, link: `/repo/${ev.pubkey}/${identifier}`, createdAt: ev.created_at,
        });
      }
    }

    // Search issues
    for (const ev of issues) {
      const subject = ev.tags.find((t) => t[0] === "subject")?.[1] ?? "";
      if (subject.toLowerCase().includes(q) || ev.content.toLowerCase().includes(q)) {
        const repoAddr = ev.tags.find((t) => t[0] === "a")?.[1] ?? "";
        const parts = repoAddr.split(":");
        const link = parts.length === 3 ? `/repo/${parts[1]}/${parts[2]}/issues/${ev.id}` : `/event/${ev.id}`;
        allResults.push({
          type: "issues", id: ev.id, title: subject || ev.content.slice(0, 80),
          description: ev.content.slice(0, 100), pubkey: ev.pubkey, link, createdAt: ev.created_at,
        });
      }
    }

    // Search snippets
    for (const ev of snippets) {
      const name = ev.tags.find((t) => t[0] === "name")?.[1] ?? "";
      const desc = ev.tags.find((t) => t[0] === "description")?.[1] ?? "";
      if (name.toLowerCase().includes(q) || desc.toLowerCase().includes(q) || ev.content.toLowerCase().includes(q)) {
        allResults.push({
          type: "snippets", id: ev.id, title: name || "Untitled snippet",
          description: desc || ev.content.slice(0, 100), pubkey: ev.pubkey,
          link: `/snippets/${ev.id}`, createdAt: ev.created_at,
        });
      }
    }

    // Search users
    for (const ev of users) {
      try {
        const meta = JSON.parse(ev.content);
        const name = meta.name ?? "";
        const displayName = meta.display_name ?? "";
        const about = meta.about ?? "";
        if (name.toLowerCase().includes(q) || displayName.toLowerCase().includes(q) || about.toLowerCase().includes(q)) {
          allResults.push({
            type: "users", id: ev.id, title: displayName || name || shortenKey(ev.pubkey),
            description: about.slice(0, 100), pubkey: ev.pubkey,
            link: `/user/${npubFromPubkey(ev.pubkey)}`, createdAt: ev.created_at,
          });
        }
      } catch { /* skip */ }
    }

    allResults.sort((a, b) => b.createdAt - a.createdAt);
    setResults(allResults);

    const pubkeys = [...new Set(allResults.map((r) => r.pubkey))];
    const profs = await fetchProfiles(pubkeys);
    setProfiles(profs);
    setLoading(false);
  };

  const filtered = filter === "all" ? results : results.filter((r) => r.type === filter);
  const counts = {
    repos: results.filter((r) => r.type === "repos").length,
    issues: results.filter((r) => r.type === "issues").length,
    users: results.filter((r) => r.type === "users").length,
    snippets: results.filter((r) => r.type === "snippets").length,
  };

  const typeIcon = (type: ResultType) => {
    switch (type) {
      case "repos": return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z"/></svg>;
      case "issues": return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-green"><path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/></svg>;
      case "users": return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted"><path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/></svg>;
      case "snippets": return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted"><path d="m11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L13.94 8l-3.72-3.72a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Zm-6.56 0a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L2.06 8l3.72 3.72a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L.47 8.53a.75.75 0 0 1 0-1.06Z"/></svg>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Search</h1>

      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search repositories, issues, users, snippets..."
            className="w-full pl-10 pr-4 py-2.5 bg-bg-primary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            autoFocus
          />
        </div>
        <button onClick={handleSearch} disabled={loading || !query.trim()} className="btn btn-primary">
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {searched && (
        <div className="flex gap-6">
          {/* Filter sidebar */}
          <div className="w-48 shrink-0">
            <div className="space-y-0.5">
              {(["all", "repos", "issues", "users", "snippets"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilter(type)}
                  className={`w-full text-left px-3 py-1.5 text-sm rounded-md cursor-pointer border-0 ${
                    filter === type ? "bg-accent/15 text-accent font-medium" : "text-text-secondary hover:bg-bg-tertiary bg-transparent"
                  }`}
                >
                  {type === "all" ? "All" : type.charAt(0).toUpperCase() + type.slice(1)}
                  <span className="float-right text-text-muted">
                    {type === "all" ? results.length : counts[type]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Results */}
          <div className="flex-1">
            {filtered.length === 0 ? (
              <div className="text-center py-10 text-text-muted">No results found</div>
            ) : (
              <div className="space-y-1">
                {filtered.map((r) => (
                  <Link key={r.id} to={r.link} className="flex items-start gap-3 px-3 py-3 rounded-lg hover:bg-bg-secondary no-underline hover:no-underline">
                    <div className="mt-0.5">{typeIcon(r.type)}</div>
                    <div className="min-w-0">
                      <div className="text-sm text-accent font-medium">{r.title}</div>
                      {r.description && <div className="text-xs text-text-muted mt-0.5 truncate">{r.description}</div>}
                      <div className="text-xs text-text-muted mt-0.5">
                        {profiles.get(r.pubkey)?.name ?? shortenKey(r.pubkey)} · {timeAgo(r.createdAt)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
