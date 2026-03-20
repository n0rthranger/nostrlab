import { useState, useEffect } from "react";
import { fetchReviews, fetchProfiles, shortenKey, timeAgo } from "../lib/nostr";
import type { ReviewEvent, UserProfile, ReviewVerdict } from "../types/nostr";

interface Props {
  targetId: string;
  refreshKey?: number;
}

function VerdictIcon({ verdict }: { verdict: ReviewVerdict }) {
  if (verdict === "approve") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="text-green flex-shrink-0" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
      </svg>
    );
  }
  if (verdict === "request-changes") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="text-red flex-shrink-0" fill="currentColor">
        <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
      </svg>
    );
  }
  // comment
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="text-accent flex-shrink-0" fill="currentColor">
      <path d="M1.5 2.75a.25.25 0 0 1 .25-.25h12.5a.25.25 0 0 1 .25.25v8.5a.25.25 0 0 1-.25.25h-6.5a.75.75 0 0 0-.53.22L4.5 14.44v-2.19a.75.75 0 0 0-.75-.75h-2a.25.25 0 0 1-.25-.25v-8.5Z" />
    </svg>
  );
}

function verdictLabel(verdict: ReviewVerdict): string {
  switch (verdict) {
    case "approve": return "approved";
    case "request-changes": return "requested changes";
    case "comment": return "left a review comment";
  }
}

function verdictBorderColor(verdict: ReviewVerdict): string {
  switch (verdict) {
    case "approve": return "border-green/30";
    case "request-changes": return "border-red/30";
    case "comment": return "border-accent/30";
  }
}

export default function ReviewList({ targetId, refreshKey }: Props) {
  const [reviews, setReviews] = useState<ReviewEvent[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const revs = await fetchReviews([targetId]);
      if (cancelled) return;
      const sorted = revs.sort((a, b) => a.createdAt - b.createdAt);
      setReviews(sorted);
      if (sorted.length > 0) {
        const profs = await fetchProfiles(sorted.map((r) => r.pubkey));
        if (!cancelled) setProfiles(profs);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [targetId, refreshKey]);

  if (loading || reviews.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-text-secondary mb-3">Reviews</h3>
      <div className="space-y-2">
        {reviews.map((review) => {
          const profile = profiles.get(review.pubkey);
          const name = profile?.name ?? shortenKey(review.pubkey);
          return (
            <div
              key={review.id}
              className={`border ${verdictBorderColor(review.verdict)} rounded-lg p-3 bg-bg-secondary`}
            >
              <div className="flex items-center gap-2">
                <VerdictIcon verdict={review.verdict} />
                {profile?.picture && (
                  <img src={profile.picture} alt="" className="w-5 h-5 rounded-full" />
                )}
                <span className="text-sm font-medium text-text-primary">{name}</span>
                <span className="text-sm text-text-muted">{verdictLabel(review.verdict)}</span>
                <span className="text-xs text-text-muted ml-auto">{timeAgo(review.createdAt)}</span>
              </div>
              {review.content && (
                <p className="text-sm text-text-secondary mt-2 ml-6">{review.content}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
