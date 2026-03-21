import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useRelays } from "../hooks/useRelays";
import { useAuth } from "../hooks/useAuth";
import { fetchProfiles, shortenKey, timeAgo, parseRepoAddress, pool } from "../lib/nostr";
import type { UserProfile } from "../types/nostr";
import { ISSUE, PATCH, PULL_REQUEST, COMMENT, REPO_ANNOUNCEMENT, REPO_STATE } from "../types/nostr";
import type { Event } from "nostr-tools";

type FilterTab = "all" | "pushes" | "issues" | "patches" | "prs" | "comments";

interface ActivityItem {
  id: string;
  kind: number;
  pubkey: string;
  content: string;
  subject?: string;
  repoAddress?: string;
  rootEventId?: string;
  rootKind?: number;
  createdAt: number;
}

function kindIcon(kind: number) {
  switch (kind) {
    case ISSUE:
      return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-green shrink-0"><path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/></svg>;
    case PATCH:
      return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-orange shrink-0"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/></svg>;
    case PULL_REQUEST:
      return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-purple shrink-0"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/></svg>;
    case COMMENT:
      return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-accent shrink-0"><path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>;
    case REPO_ANNOUNCEMENT:
    case REPO_STATE:
      return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-accent shrink-0"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/></svg>;
    default:
      return null;
  }
}

function kindLabel(kind: number): string {
  switch (kind) {
    case ISSUE: return "opened an issue";
    case PATCH: return "submitted a patch";
    case PULL_REQUEST: return "opened a pull request";
    case COMMENT: return "commented";
    case REPO_ANNOUNCEMENT: return "created a repository";
    case REPO_STATE: return "pushed to";
    default: return "acted";
  }
}

function kindNoun(kind: number): string {
  switch (kind) {
    case ISSUE: return "Issue";
    case PATCH: return "Patch";
    case PULL_REQUEST: return "Pull Request";
    case COMMENT: return "Comment";
    case REPO_ANNOUNCEMENT: return "Repository";
    case REPO_STATE: return "Push";
    default: return "Event";
  }
}


function getItemLink(item: ActivityItem): string {
  // For repo state (pushes), link to the repo page
  if ((item.kind === REPO_STATE || item.kind === REPO_ANNOUNCEMENT) && item.repoAddress) {
    const parsed = parseRepoAddress(item.repoAddress);
    if (parsed) return `/repo/${parsed.pubkey}/${parsed.identifier}`;
  }
  // For comments, link to the root event thread so context is visible
  if (item.kind === COMMENT && item.rootEventId) {
    return `/event/${item.rootEventId}`;
  }
  // For issues/patches/PRs, link to the event thread page
  return `/event/${item.id}`;
}

const FILTER_TABS: { id: FilterTab; label: string; kinds: number[] | null }[] = [
  { id: "all", label: "All activity", kinds: null },
  { id: "pushes", label: "Pushes", kinds: [REPO_ANNOUNCEMENT, REPO_STATE] },
  { id: "issues", label: "Issues", kinds: [ISSUE] },
  { id: "patches", label: "Patches", kinds: [PATCH] },
  { id: "prs", label: "Pull Requests", kinds: [PULL_REQUEST] },
  { id: "comments", label: "Comments", kinds: [COMMENT] },
];

export default function ActivityPage() {
  const { pubkey } = useAuth();
  const { globalRelays } = useRelays();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const since = Math.floor(Date.now() / 1000) - 7 * 86400;

      // Query code activity events and repo state events in parallel
      const [codeEvents, repoStateEvents] = await Promise.all([
        pool.querySync(globalRelays, {
          kinds: [ISSUE, PATCH, PULL_REQUEST, COMMENT],
          since,
          limit: 100,
        }),
        pool.querySync(globalRelays, {
          kinds: [REPO_STATE],
          since,
          limit: 50,
        }),
      ]);
      if (cancelled) return;

      const events: Event[] = [...codeEvents, ...repoStateEvents];

      // Filter to only code-related events
      const codeRelated = events.filter((e) => {
        // Issues, patches, PRs, repo state are always code-related
        if (e.kind === ISSUE || e.kind === PATCH || e.kind === PULL_REQUEST) return true;
        if (e.kind === REPO_STATE) return true;
        // Comments (kind 1111) are only relevant if they reference a repo (30617:)
        // or reply to a code event (issue/patch/PR kind)
        if (e.kind === COMMENT) {
          const hasRepoTag = e.tags.some((t) => t[0] === "a" && t[1]?.startsWith("30617:"));
          const rootKTag = e.tags.find((t) => t[0] === "K");
          const rootKind = rootKTag?.[1] ? Number(rootKTag[1]) : undefined;
          const isCodeReply = rootKind === ISSUE || rootKind === PATCH || rootKind === PULL_REQUEST;
          return hasRepoTag || isCodeReply;
        }
        return false;
      });

      const activityItems: ActivityItem[] = codeRelated.map((e) => {
        const subjectTag = e.tags.find((t) => t[0] === "subject");
        // Try multiple `a` tags — pick the one that looks like a repo address (30617:...)
        const aTags = e.tags.filter((t) => t[0] === "a").map((t) => t[1]);
        let repoAddr = aTags.find((a) => a?.startsWith("30617:")) ?? aTags[0];
        // For comments: get root event ID and kind to link back to parent
        // NIP-22 uses uppercase E/K tags for root
        const rootETag = e.tags.find((t) => t[0] === "E");
        const rootKTag = e.tags.find((t) => t[0] === "K");
        // Fallback: lowercase e tags with "root" marker, or first e tag
        const eTags = e.tags.filter((t) => t[0] === "e");
        const rootEFromLower = eTags.find((t) => t[3] === "root") ?? eTags[0];
        // For patches: extract subject from content if not in tags
        let subject = subjectTag?.[1];
        if (!subject && e.kind === PATCH) {
          const subjectLine = e.content.split("\n").find((l) => l.startsWith("Subject:"));
          if (subjectLine) {
            subject = subjectLine.replace("Subject: ", "").replace(/\[PATCH[^\]]*\]\s*/, "");
          }
        }

        // For repo state events (pushes): extract repo identifier from d tag
        if (e.kind === REPO_STATE) {
          const dTag = e.tags.find((t) => t[0] === "d");
          if (dTag?.[1]) {
            repoAddr = `30617:${e.pubkey}:${dTag[1]}`;
          }
          // Extract branch info: HEAD tag has ["HEAD", "refs/heads/main"]
          // Ref tags are like ["refs/heads/main", "<commit-oid>"]
          const headTag = e.tags.find((t) => t[0] === "HEAD");
          const headRef = headTag?.[1] || "";
          const branch = headRef.replace("refs/heads/", "") || "main";
          const refTag = e.tags.find((t) => t[0]?.startsWith("refs/heads/"));
          const commitOid = refTag?.[1]?.slice(0, 7) || "";
          subject = `Pushed to ${branch}${commitOid ? ` (${commitOid})` : ""}`;
        }

        return {
          id: e.id,
          kind: e.kind,
          pubkey: e.pubkey,
          content: e.content.slice(0, 200),
          subject,
          repoAddress: repoAddr,
          rootEventId: rootETag?.[1] || rootEFromLower?.[1],
          rootKind: rootKTag?.[1] ? Number(rootKTag[1]) : undefined,
          createdAt: e.created_at,
        };
      }).sort((a, b) => b.createdAt - a.createdAt);

      setItems(activityItems);

      const pubkeys = [...new Set(activityItems.map((i) => i.pubkey))];
      const profs = await fetchProfiles(pubkeys, globalRelays);
      if (!cancelled) setProfiles(profs);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [globalRelays]);

  const tab = FILTER_TABS.find((t) => t.id === activeFilter)!;
  const filtered = tab.kinds ? items.filter((i) => tab.kinds!.includes(i.kind)) : items;

  // Group items by date
  const grouped = new Map<string, ActivityItem[]>();
  for (const item of filtered) {
    const date = new Date(item.createdAt * 1000);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let label: string;
    if (date.toDateString() === today.toDateString()) {
      label = "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      label = "Yesterday";
    } else {
      label = date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    }

    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label)!.push(item);
  }

  // Counts for filter tabs
  const counts: Record<FilterTab, number> = {
    all: items.length,
    pushes: items.filter((i) => i.kind === REPO_STATE || i.kind === REPO_ANNOUNCEMENT).length,
    issues: items.filter((i) => i.kind === ISSUE).length,
    patches: items.filter((i) => i.kind === PATCH).length,
    prs: items.filter((i) => i.kind === PULL_REQUEST).length,
    comments: items.filter((i) => i.kind === COMMENT).length,
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Activity Feed</h1>
        <p className="text-sm text-text-secondary mt-1">
          Recent code activity — issues, patches, pull requests, and code reviews across repositories on your relays.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="UnderlineNav mb-4">
        {FILTER_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveFilter(t.id)}
            className={`UnderlineNav-item ${activeFilter === t.id ? "selected" : ""}`}
            aria-selected={activeFilter === t.id}
          >
            {t.label}
            {counts[t.id] > 0 && <span className="Counter">{counts[t.id]}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-text-secondary">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">Loading activity from relays...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="Blankslate Box">
          <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted mx-auto mb-2">
            <path d="M8 16a2 2 0 0 0 1.985-1.75c.017-.137-.097-.25-.235-.25h-3.5c-.138 0-.252.113-.235.25A2 2 0 0 0 8 16ZM3 5a5 5 0 0 1 10 0v2.947c0 .05.015.098.042.139l1.703 2.555A1.519 1.519 0 0 1 13.482 13H2.518a1.516 1.516 0 0 1-1.263-2.36l1.703-2.554A.255.255 0 0 0 3 7.947Z" />
          </svg>
          <h3 className="text-lg font-medium text-text-primary mb-1">No recent activity</h3>
          <p>
            {activeFilter === "all"
              ? "No activity found in the last 7 days across your connected relays."
              : `No ${tab.label.toLowerCase()} found in the last 7 days.`}
          </p>
          {!pubkey && (
            <Link to="/login" className="btn btn-primary btn-sm mt-4 no-underline hover:no-underline">
              Sign in to get started
            </Link>
          )}
        </div>
      ) : (
        <div>
          {[...grouped.entries()].map(([dateLabel, dateItems]) => (
            <div key={dateLabel} className="mb-6">
              {/* Date header */}
              <div className="flex items-center gap-3 mb-2">
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{dateLabel}</div>
                <div className="flex-1 h-px bg-border" />
                <div className="text-xs text-text-muted">{dateItems.length} {dateItems.length === 1 ? "event" : "events"}</div>
              </div>

              <div className="Box">
                {dateItems.map((item) => {
                  const profile = profiles.get(item.pubkey);
                  const name = profile?.displayName || profile?.name || shortenKey(item.pubkey);
                  const parsed = item.repoAddress ? parseRepoAddress(item.repoAddress) : null;
                  const itemLink = getItemLink(item);

                  return (
                    <Link key={item.id} to={itemLink} className="Box-row flex items-start gap-3 no-underline hover:no-underline cursor-pointer">
                      {/* Avatar */}
                      {profile?.picture ? (
                        <img src={profile.picture} alt="" className="w-8 h-8 rounded-full shrink-0 avatar mt-0.5" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-bg-tertiary shrink-0 flex items-center justify-center text-text-muted text-xs mt-0.5">
                          {name[0].toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        {/* Action line */}
                        <p className="text-sm">
                          <span className="font-semibold text-text-primary">{name}</span>
                          {" "}
                          <span className="text-text-secondary">{kindLabel(item.kind)}</span>
                          {parsed && (
                            <>
                              {" in "}
                              <span className="font-medium text-accent">
                                {parsed.identifier}
                              </span>
                            </>
                          )}
                        </p>

                        {/* Subject / content preview */}
                        {item.subject && (
                          <p className="text-sm text-text-primary mt-0.5 font-medium">{item.subject}</p>
                        )}
                        {item.content && !item.subject && item.kind === COMMENT && (
                          <p className="text-xs text-text-muted mt-0.5 truncate italic">"{item.content}"</p>
                        )}

                        {/* Meta line */}
                        <div className="flex items-center gap-2 mt-1.5">
                          {kindIcon(item.kind)}
                          <span className="text-xs text-text-muted">{kindNoun(item.kind)}</span>
                          <span className="text-xs text-text-muted">{timeAgo(item.createdAt)}</span>
                          <span className="text-xs text-accent ml-auto">View &rarr;</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
