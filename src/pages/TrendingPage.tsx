import { useEffect, useState } from "react";
import {
  fetchRepos,
  fetchProfiles,
  fetchReactions,
  fetchZapReceipts,
  DEFAULT_RELAYS,
} from "../lib/nostr";
import type { RepoAnnouncement, UserProfile } from "../types/nostr";
import RepoCard from "../components/RepoCard";

type TimeWindow = "today" | "week" | "month";

interface TrendingRepo {
  repo: RepoAnnouncement;
  score: number;
  stars: number;
  zaps: number;
}

export default function TrendingPage() {
  const [repos, setRepos] = useState<TrendingRepo[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("week");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const now = Math.floor(Date.now() / 1000);
      const windowSeconds = timeWindow === "today" ? 86400 : timeWindow === "week" ? 7 * 86400 : 30 * 86400;
      const since = now - windowSeconds;

      const allRepos = await fetchRepos(DEFAULT_RELAYS, 200);
      if (cancelled) return;

      const repoIds = allRepos.map((r) => r.id);
      const [reactions, zaps] = await Promise.all([
        fetchReactions(repoIds),
        fetchZapReceipts(repoIds),
      ]);

      const recentReactions = reactions.filter((r) => r.createdAt >= since);
      const recentZaps = zaps.filter((z) => z.createdAt >= since);

      const starCounts: Record<string, number> = {};
      const zapCounts: Record<string, number> = {};
      for (const r of recentReactions) {
        starCounts[r.targetId] = (starCounts[r.targetId] ?? 0) + 1;
      }
      for (const z of recentZaps) {
        zapCounts[z.targetId] = (zapCounts[z.targetId] ?? 0) + 1;
      }

      const trending: TrendingRepo[] = allRepos.map((repo) => {
        const stars = starCounts[repo.id] ?? 0;
        const zapCount = zapCounts[repo.id] ?? 0;
        const recency = repo.createdAt >= since ? 2 : 0;
        const score = stars * 3 + zapCount * 5 + recency;
        return { repo, score, stars, zaps: zapCount };
      }).filter((t) => t.score > 0).sort((a, b) => b.score - a.score).slice(0, 30);

      setRepos(trending);

      const pubkeys = [...new Set(trending.map((t) => t.repo.pubkey))];
      const profs = await fetchProfiles(pubkeys);
      if (!cancelled) setProfiles(profs);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [timeWindow]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Trending</h1>
        <div className="flex gap-1 bg-bg-tertiary rounded-lg p-0.5">
          {(["today", "week", "month"] as const).map((tw) => (
            <button
              key={tw}
              onClick={() => setTimeWindow(tw)}
              className={`px-3 py-1 text-sm rounded-md cursor-pointer border-0 ${
                timeWindow === tw ? "bg-bg-secondary text-text-primary shadow-sm" : "text-text-muted bg-transparent hover:text-text-secondary"
              }`}
            >
              {tw === "today" ? "Today" : tw === "week" ? "This week" : "This month"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-text-secondary">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
          <p>Computing trends...</p>
        </div>
      ) : repos.length === 0 ? (
        <div className="Blankslate Box">
          <p>No trending repos for this time period</p>
        </div>
      ) : (
        <div className="space-y-3">
          {repos.map((t, idx) => (
            <div key={t.repo.id} className="flex items-start gap-3">
              <span className="text-lg font-bold text-text-muted w-8 text-right shrink-0 mt-3">{idx + 1}</span>
              <div className="flex-1">
                <RepoCard repo={t.repo} authorName={profiles.get(t.repo.pubkey)?.name} />
              </div>
              <div className="flex flex-col gap-1 shrink-0 mt-3 text-xs text-text-muted">
                {t.stars > 0 && <span className="text-orange">★ {t.stars}</span>}
                {t.zaps > 0 && <span className="text-orange">⚡ {t.zaps}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
