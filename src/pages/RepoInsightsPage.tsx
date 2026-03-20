import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useRelays } from "../hooks/useRelays";
import {
  pool,
  DEFAULT_RELAYS,
  fetchProfiles,
  shortenKey,
  repoAddress,
  npubFromPubkey,
} from "../lib/nostr";
import type { UserProfile } from "../types/nostr";
import { ISSUE, PATCH, PULL_REQUEST, COMMENT } from "../types/nostr";
import type { Event } from "nostr-tools";

interface ContributorEntry {
  pubkey: string;
  count: number;
}

interface WeekBucket {
  weekLabel: string;
  count: number;
}

export default function RepoInsightsPage() {
  const { pubkey, identifier } = useParams<{
    pubkey: string;
    identifier: string;
  }>();
  const { globalRelays } = useRelays();

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(
    new Map()
  );

  const relays = globalRelays.length > 0 ? globalRelays : DEFAULT_RELAYS;
  const repoAddr = pubkey && identifier ? repoAddress(pubkey, identifier) : "";

  useEffect(() => {
    if (!repoAddr) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      const evts: Event[] = await pool.querySync(relays, {
        kinds: [ISSUE, PATCH, PULL_REQUEST, COMMENT],
        "#a": [repoAddr],
      });
      if (cancelled) return;
      setEvents(evts);

      const pubkeys = [...new Set(evts.map((e) => e.pubkey))];
      const profs = await fetchProfiles(pubkeys, relays);
      if (!cancelled) setProfiles(profs);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [repoAddr, relays.join(",")]);

  // --- Pulse: last 30 days ---
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const thirtyDaysAgo = now - 30 * 86400;
  const recentEvents = events.filter((e) => e.created_at >= thirtyDaysAgo);

  const issuesOpened = recentEvents.filter((e) => e.kind === ISSUE).length;
  const patchesSubmitted = recentEvents.filter((e) => e.kind === PATCH).length;
  const prsOpened = recentEvents.filter(
    (e) => e.kind === PULL_REQUEST
  ).length;
  const commentsCount = recentEvents.filter((e) => e.kind === COMMENT).length;

  // --- Contributors: sorted by contribution count ---
  const contributorMap = new Map<string, number>();
  for (const e of events) {
    contributorMap.set(e.pubkey, (contributorMap.get(e.pubkey) ?? 0) + 1);
  }
  const contributors: ContributorEntry[] = [...contributorMap.entries()]
    .map(([pk, count]) => ({ pubkey: pk, count }))
    .sort((a, b) => b.count - a.count);

  // --- Activity timeline: last 12 weeks ---
  const weekBuckets: WeekBucket[] = [];
  for (let i = 11; i >= 0; i--) {
    const weekStart = now - (i + 1) * 7 * 86400;
    const weekEnd = now - i * 7 * 86400;
    const count = events.filter(
      (e) => e.created_at >= weekStart && e.created_at < weekEnd
    ).length;
    const startDate = new Date(weekStart * 1000);
    const label = `${startDate.getMonth() + 1}/${startDate.getDate()}`;
    weekBuckets.push({ weekLabel: label, count });
  }
  const maxWeekCount = Math.max(...weekBuckets.map((b) => b.count), 1);

  if (!pubkey || !identifier) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center text-text-secondary">
        Invalid repository parameters.
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back link */}
      <div className="mb-4">
        <Link
          to={`/repo/${pubkey}/${identifier}`}
          className="text-sm text-accent hover:underline"
        >
          &larr; Back to {identifier}
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Insights</h1>
        <p className="text-sm text-text-secondary mt-1">
          Analytics and activity for{" "}
          <span className="font-medium text-text-primary">{identifier}</span>
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-text-secondary">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">Loading insights from relays...</p>
        </div>
      ) : (
        <>
          {/* Pulse */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Pulse</h2>
            <p className="text-xs text-text-muted mb-3">Last 30 days</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="Box p-4 text-center">
                <div className="text-2xl font-bold text-green">
                  {issuesOpened}
                </div>
                <div className="text-xs text-text-secondary mt-1">
                  Issues opened
                </div>
              </div>
              <div className="Box p-4 text-center">
                <div className="text-2xl font-bold text-orange">
                  {patchesSubmitted}
                </div>
                <div className="text-xs text-text-secondary mt-1">
                  Patches submitted
                </div>
              </div>
              <div className="Box p-4 text-center">
                <div className="text-2xl font-bold text-purple">
                  {prsOpened}
                </div>
                <div className="text-xs text-text-secondary mt-1">
                  PRs opened
                </div>
              </div>
              <div className="Box p-4 text-center">
                <div className="text-2xl font-bold text-accent">
                  {commentsCount}
                </div>
                <div className="text-xs text-text-secondary mt-1">
                  Comments
                </div>
              </div>
            </div>
          </section>

          {/* Contributors */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Contributors</h2>
            {contributors.length === 0 ? (
              <div className="Box p-6 text-center text-text-muted text-sm">
                No contributors found.
              </div>
            ) : (
              <div className="Box">
                {contributors.map((c) => {
                  const profile = profiles.get(c.pubkey);
                  const name =
                    profile?.displayName ||
                    profile?.name ||
                    shortenKey(c.pubkey);
                  return (
                    <div
                      key={c.pubkey}
                      className="Box-row flex items-center gap-3"
                    >
                      {profile?.picture ? (
                        <img
                          src={profile.picture}
                          alt=""
                          className="w-8 h-8 rounded-full shrink-0 avatar"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-bg-tertiary shrink-0 flex items-center justify-center text-text-muted text-xs">
                          {name[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/user/${npubFromPubkey(c.pubkey)}`}
                          className="text-sm font-semibold text-text-primary hover:text-accent"
                        >
                          {name}
                        </Link>
                      </div>
                      <span className="text-xs text-text-muted">
                        {c.count} {c.count === 1 ? "contribution" : "contributions"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Activity Timeline */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Activity Timeline</h2>
            <p className="text-xs text-text-muted mb-3">
              Events per week, last 12 weeks
            </p>
            <div className="Box p-4">
              <div className="flex items-end gap-1" style={{ height: 120 }}>
                {weekBuckets.map((bucket) => {
                  const heightPct =
                    bucket.count > 0
                      ? Math.max((bucket.count / maxWeekCount) * 100, 4)
                      : 0;
                  return (
                    <div
                      key={bucket.weekLabel}
                      className="flex-1 flex flex-col items-center gap-1"
                    >
                      <span className="text-[10px] text-text-muted">
                        {bucket.count > 0 ? bucket.count : ""}
                      </span>
                      <div
                        className="w-full rounded-sm bg-accent"
                        style={{
                          height: `${heightPct}%`,
                          minHeight: bucket.count > 0 ? 4 : 0,
                        }}
                        title={`${bucket.weekLabel}: ${bucket.count} events`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-1 mt-2">
                {weekBuckets.map((bucket) => (
                  <div
                    key={bucket.weekLabel}
                    className="flex-1 text-center text-[10px] text-text-muted"
                  >
                    {bucket.weekLabel}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
