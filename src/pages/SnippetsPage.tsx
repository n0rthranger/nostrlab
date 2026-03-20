import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSnippets, fetchProfiles, shortenKey, timeAgo } from "../lib/nostr";
import type { CodeSnippetEvent, UserProfile } from "../types/nostr";
import { useAuth } from "../hooks/useAuth";
import { useRelays } from "../hooks/useRelays";

export default function SnippetsPage() {
  const { pubkey } = useAuth();
  const { globalRelays } = useRelays();
  const [snippets, setSnippets] = useState<CodeSnippetEvent[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [langFilter, setLangFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const snips = await fetchSnippets(globalRelays, 100);
      if (cancelled) return;
      const sorted = snips.sort((a, b) => b.createdAt - a.createdAt);
      setSnippets(sorted);
      const pubkeys = [...new Set(sorted.map((s) => s.pubkey))];
      const profs = await fetchProfiles(pubkeys, globalRelays);
      if (cancelled) return;
      setProfiles(profs);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [globalRelays]);

  const languages = [...new Set(snippets.map((s) => s.language).filter(Boolean))] as string[];

  const filtered = snippets.filter((s) => {
    if (langFilter && s.language !== langFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (s.name?.toLowerCase().includes(q)) ||
        (s.description?.toLowerCase().includes(q)) ||
        s.content.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Code Snippets</h1>
        {pubkey && (
          <Link
            to="/snippets/new"
            className="px-3 py-1.5 bg-green text-white rounded-md text-sm font-medium no-underline hover:opacity-90"
          >
            New Snippet
          </Link>
        )}
      </div>

      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search snippets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-md bg-bg-secondary border border-border rounded-md px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        <select
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value)}
          className="bg-bg-secondary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent cursor-pointer"
        >
          <option value="">All languages</option>
          {languages.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-20 text-text-secondary">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
          <p>Loading snippets...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-text-muted">
          <p className="text-lg">No snippets found</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((snippet) => {
            const profile = profiles.get(snippet.pubkey);
            return (
              <Link
                key={snippet.id}
                to={`/snippets/${snippet.id}`}
                className="block border border-border rounded-lg p-4 hover:border-text-muted bg-bg-secondary no-underline"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-accent font-medium">
                        {snippet.name ?? "Untitled snippet"}
                      </span>
                      {snippet.language && (
                        <span className="text-xs px-1.5 py-0 rounded bg-accent/15 text-accent font-mono">
                          {snippet.language}
                        </span>
                      )}
                    </div>
                    {snippet.description && (
                      <p className="text-sm text-text-secondary mt-1">{snippet.description}</p>
                    )}
                    <pre className="mt-2 text-xs text-text-muted bg-bg-primary rounded p-2 overflow-hidden max-h-20">
                      {snippet.content.slice(0, 200)}
                    </pre>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
                  <span>{profile?.name ?? shortenKey(snippet.pubkey)}</span>
                  <span>{timeAgo(snippet.createdAt)}</span>
                  {snippet.license && <span>{snippet.license}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
