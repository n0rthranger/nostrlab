import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchRepos, fetchProfiles } from "../lib/nostr";
import type { RepoAnnouncement, UserProfile } from "../types/nostr";
import RepoCard from "../components/RepoCard";

export default function TopicPage() {
  const { tag } = useParams<{ tag: string }>();
  const [repos, setRepos] = useState<RepoAnnouncement[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [allTags, setAllTags] = useState<{ tag: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const allRepos = await fetchRepos(undefined, 200);
      if (cancelled) return;

      // Compute tag counts
      const tagCounts: Record<string, number> = {};
      for (const r of allRepos) {
        for (const t of r.tags) {
          if (t !== "unlisted" && t !== "personal-fork") {
            tagCounts[t] = (tagCounts[t] ?? 0) + 1;
          }
        }
      }
      setAllTags(
        Object.entries(tagCounts)
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count)
      );

      const filtered = tag
        ? allRepos.filter((r) => r.tags.includes(tag)).sort((a, b) => b.createdAt - a.createdAt)
        : allRepos.sort((a, b) => b.createdAt - a.createdAt);
      setRepos(filtered);

      const pubkeys = [...new Set(filtered.map((r) => r.pubkey))];
      const profs = await fetchProfiles(pubkeys);
      if (!cancelled) setProfiles(profs);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [tag]);

  if (loading) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p>Loading topics...</p>
      </div>
    );
  }

  // Topics index
  if (!tag) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">Topics</h1>
        <div className="flex flex-wrap gap-2">
          {allTags.map((t) => (
            <Link
              key={t.tag}
              to={`/topics/${t.tag}`}
              className="Label bg-accent/10 text-accent border-accent/20 text-sm no-underline hover:no-underline hover:bg-accent/20 px-3 py-1"
            >
              {t.tag}
              <span className="ml-1.5 text-text-muted text-xs">{t.count}</span>
            </Link>
          ))}
        </div>
        {allTags.length === 0 && (
          <div className="Blankslate Box mt-4">
            <p>No topics found. Add tags to your repositories!</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-3">
        <Link to="/topics" className="text-sm text-accent hover:underline">&larr; All topics</Link>
      </div>
      <h1 className="text-2xl font-semibold mb-2">
        <span className="Label bg-accent/10 text-accent border-accent/20 text-lg px-3 py-1">{tag}</span>
      </h1>
      <p className="text-sm text-text-muted mb-6">{repos.length} repositories</p>

      {repos.length === 0 ? (
        <div className="Blankslate Box">
          <p>No repositories with this tag</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {repos.map((repo) => (
            <RepoCard
              key={`${repo.pubkey}:${repo.identifier}`}
              repo={repo}
              authorName={profiles.get(repo.pubkey)?.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}
