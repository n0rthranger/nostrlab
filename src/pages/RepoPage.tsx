import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import type { Event } from "nostr-tools";
import {
  fetchRepo,
  fetchRepoState,
  fetchIssues,
  fetchPatches,
  fetchPullRequests,
  fetchStatuses,
  fetchProfiles,
  shortenKey,
  timeAgo,
  DEFAULT_RELAYS,
  parseRepoAddress,
  parseIssue,
  parsePatch,
  parsePullRequest,
  npubFromPubkey,
} from "../lib/nostr";
import type {
  RepoAnnouncement,
  RepoState,
  IssueEvent,
  PatchEvent,
  PullRequestEvent,
  StatusEvent,
  UserProfile,
  StatusKind,
} from "../types/nostr";
import { STATUS_OPEN, ISSUE, PATCH, PULL_REQUEST } from "../types/nostr";
import { repoAddress } from "../lib/nostr";
import { useAuth } from "../hooks/useAuth";
import { useRelays } from "../hooks/useRelays";
import { useSubscription } from "../hooks/useSubscription";
import { triggerMatchingWebhooks } from "../lib/webhooks";
import StatusBadge from "../components/StatusBadge";
import CodeBrowser from "../components/CodeBrowser";
import NostrCodeBrowser from "../components/NostrCodeBrowser";
import RepoRefs from "../components/RepoRefs";
import StarButton from "../components/StarButton";
import ZapButton from "../components/ZapButton";
import CIStatusBadge from "../components/CIStatusBadge";
import ForkDiffView from "../components/ForkDiffView";
import SponsorTab from "../components/SponsorTab";

type Tab = "code" | "issues" | "patches" | "prs" | "releases" | "discussions" | "bounties" | "boards" | "insights" | "changelog" | "sponsor";

export default function RepoPage() {
  const { pubkey, identifier } = useParams<{ pubkey: string; identifier: string }>();
  const auth = useAuth();
  const { getRelaysForRepo } = useRelays();
  const [repo, setRepo] = useState<RepoAnnouncement | null>(null);
  const [repoState, setRepoState] = useState<RepoState | null>(null);
  const [issues, setIssues] = useState<IssueEvent[]>([]);
  const [patches, setPatches] = useState<PatchEvent[]>([]);
  const [prs, setPrs] = useState<PullRequestEvent[]>([]);
  const [statuses, setStatuses] = useState<StatusEvent[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("code");
  const [copied, setCopied] = useState("");
  const [pinned, setPinned] = useState(false);
  const [codeSource, setCodeSource] = useState<"nostr" | "git" | null>(null);
  const [showForkDiff, setShowForkDiff] = useState(false);

  useEffect(() => {
    if (!auth.pubkey || !pubkey || !identifier) return;
    const key = `pinned-repos-${auth.pubkey}`;
    const list: string[] = JSON.parse(localStorage.getItem(key) || "[]");
    setPinned(list.includes(`${pubkey}:${identifier}`));
  }, [auth.pubkey, pubkey, identifier]);

  useEffect(() => {
    if (!pubkey || !identifier) return;
    let cancelled = false;
    setLoading(true);

    const addr = repoAddress(pubkey, identifier);
    const relays = getRelaysForRepo(addr);

    Promise.all([
      fetchRepo(pubkey, identifier, relays),
      fetchRepoState(pubkey, identifier, relays),
      fetchIssues(addr, relays),
      fetchPatches(addr, relays),
      fetchPullRequests(addr, relays),
    ]).then(async ([repo, state, issues, patches, prs]) => {
      if (cancelled) return;
      setRepo(repo);
      setRepoState(state);
      // Default to git if HTTP clone URLs exist, otherwise nostr files
      if (repo) {
        const hasCloneUrl = repo.cloneUrls.some((u: string) => /^https?:\/\//i.test(u));
        setCodeSource(hasCloneUrl ? "git" : "nostr");
      }
      setIssues(issues);
      setPatches(patches);
      setPrs(prs);

      const allIds = [
        ...issues.map((i) => i.id),
        ...patches.filter((p) => p.isRoot).map((p) => p.id),
        ...prs.map((p) => p.id),
      ];
      const sts = await fetchStatuses(allIds, relays);
      if (!cancelled) setStatuses(sts);

      const allPubkeys = [
        pubkey,
        ...issues.map((i) => i.pubkey),
        ...patches.map((p) => p.pubkey),
        ...prs.map((p) => p.pubkey),
      ];
      const profs = await fetchProfiles(allPubkeys, relays);
      if (cancelled) return;
      setProfiles(profs);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey, identifier]);

  // ── Live subscriptions for new issues/patches/PRs ──
  const addr = pubkey && identifier ? repoAddress(pubkey, identifier) : "";
  const liveRelays = addr ? getRelaysForRepo(addr) : [];
  // Stable timestamp — computed once on mount, not every render
  const [sinceTs] = useState(() => Math.floor(Date.now() / 1000));

  const liveIssueParser = useCallback((event: Event) => {
    const parsed = parseIssue(event);
    if (parsed) triggerMatchingWebhooks(addr, "issues", event);
    return parsed;
  }, [addr]);
  const livePatchParser = useCallback((event: Event) => {
    const parsed = parsePatch(event);
    if (parsed) triggerMatchingWebhooks(addr, "patches", event);
    return parsed;
  }, [addr]);
  const livePrParser = useCallback((event: Event) => {
    const parsed = parsePullRequest(event);
    if (parsed) triggerMatchingWebhooks(addr, "prs", event);
    return parsed;
  }, [addr]);

  const { events: liveIssues, newCount: newIssueCount, flush: flushIssues } = useSubscription(
    liveRelays,
    addr ? [{ kinds: [ISSUE], "#a": [addr], since: sinceTs }] : [],
    liveIssueParser,
    { enabled: !!addr },
  );
  const { events: livePatches, newCount: newPatchCount, flush: flushPatches } = useSubscription(
    liveRelays,
    addr ? [{ kinds: [PATCH], "#a": [addr], since: sinceTs }] : [],
    livePatchParser,
    { enabled: !!addr },
  );
  const { events: livePrs, newCount: newPrCount, flush: flushPrs } = useSubscription(
    liveRelays,
    addr ? [{ kinds: [PULL_REQUEST], "#a": [addr], since: sinceTs }] : [],
    livePrParser,
    { enabled: !!addr },
  );

  // Merge live events with initial fetch
  const allIssues = (() => {
    const ids = new Set(issues.map((i) => i.id));
    const merged = [...issues];
    for (const li of liveIssues) { if (!ids.has(li.id)) { merged.push(li); ids.add(li.id); } }
    return merged;
  })();
  const allPatches = (() => {
    const ids = new Set(patches.map((p) => p.id));
    const merged = [...patches];
    for (const lp of livePatches) { if (!ids.has(lp.id)) { merged.push(lp); ids.add(lp.id); } }
    return merged;
  })();
  const allPrs = (() => {
    const ids = new Set(prs.map((p) => p.id));
    const merged = [...prs];
    for (const lp of livePrs) { if (!ids.has(lp.id)) { merged.push(lp); ids.add(lp.id); } }
    return merged;
  })();

  const getLatestStatus = (targetId: string): StatusKind => {
    const relevant = statuses
      .filter((s) => s.targetId === targetId)
      .sort((a, b) => b.createdAt - a.createdAt);
    return relevant.length > 0 ? relevant[0].kind : STATUS_OPEN;
  };

  if (loading) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p>Loading repository...</p>
      </div>
    );
  }

  if (!repo) {
    return (
      <div className="Blankslate">
        <p className="text-lg text-text-primary">Repository not found</p>
        <p>The repository you're looking for doesn't exist or hasn't been announced.</p>
      </div>
    );
  }

  const authorProfile = profiles.get(repo.pubkey);
  const authorName = authorProfile?.name ?? shortenKey(repo.pubkey);
  const rootPatches = allPatches.filter((p) => p.isRoot || p.isRootRevision);

  let upstreamLink: { pubkey: string; identifier: string } | null = null;
  if (repo.isPersonalFork && repo.upstreamAddress) {
    upstreamLink = parseRepoAddress(repo.upstreamAddress);
  }

  const tabs: { id: Tab; label: string; count?: number; icon: React.ReactNode }[] = [
    {
      id: "code",
      label: "Code",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="m11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L13.94 8l-3.72-3.72a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Zm-6.56 0a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L2.06 8l3.72 3.72a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L.47 8.53a.75.75 0 0 1 0-1.06Z"/></svg>,
    },
    {
      id: "issues",
      label: "Issues",
      count: allIssues.length,
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/></svg>,
    },
    {
      id: "patches",
      label: "Patches",
      count: rootPatches.length,
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/></svg>,
    },
    {
      id: "prs",
      label: "Pull Requests",
      count: allPrs.length,
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/></svg>,
    },
    {
      id: "releases",
      label: "Releases",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/></svg>,
    },
    {
      id: "discussions",
      label: "Discussions",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 10.25 10H7.061l-2.574 2.573A1.458 1.458 0 0 1 2 11.543V10h-.25A1.75 1.75 0 0 1 0 8.25v-5.5C0 1.784.784 1 1.75 1ZM1.5 2.75v5.5c0 .138.112.25.25.25h1a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h3.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Z"/></svg>,
    },
    {
      id: "bounties",
      label: "Bounties",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    },
    {
      id: "boards",
      label: "Boards",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25V1.75C0 .784.784 0 1.75 0ZM1.5 1.75v12.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25ZM11.75 3a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-1.5 0v-7.5a.75.75 0 0 1 .75-.75Zm-8.25.75a.75.75 0 0 1 1.5 0v5.5a.75.75 0 0 1-1.5 0ZM8 3a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 3Z"/></svg>,
    },
    {
      id: "insights",
      label: "Insights",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1.75V13.5h13.75a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75V1.75a.75.75 0 0 1 1.5 0Zm14.28 2.53-5.25 5.25a.75.75 0 0 1-1.06 0L7 7.06 4.28 9.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.25-3.25a.75.75 0 0 1 1.06 0L10 7.94l4.72-4.72a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"/></svg>,
    },
    {
      id: "changelog",
      label: "Changelog",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 2.75C1 1.784 1.784 1 2.75 1h3a.75.75 0 0 1 0 1.5h-3a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-3a.75.75 0 0 1 1.5 0v3A1.75 1.75 0 0 1 13.25 15H2.75A1.75 1.75 0 0 1 1 13.25Zm11.06-4.72a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L7.56 4.47h2.69a.75.75 0 0 1 0 1.5H5.75a.75.75 0 0 1-.75-.75V.72a.75.75 0 0 1 1.5 0v2.69Z"/></svg>,
    },
    {
      id: "sponsor",
      label: "Sponsor",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="m8 14.25.345.666a.75.75 0 0 1-.69 0l-.008-.004-.018-.01a7.152 7.152 0 0 1-.31-.17 22.055 22.055 0 0 1-3.434-2.414C2.045 10.731 0 8.35 0 5.5 0 2.836 2.086 1 4.25 1 5.797 1 7.153 1.802 8 3.02 8.847 1.802 10.203 1 11.75 1 13.914 1 16 2.836 16 5.5c0 2.85-2.045 5.231-3.885 6.818a22.066 22.066 0 0 1-3.744 2.584l-.018.01-.006.003h-.002ZM4.25 2.5c-1.336 0-2.75 1.164-2.75 3 0 2.15 1.58 4.144 3.365 5.682A20.58 20.58 0 0 0 8 13.393a20.58 20.58 0 0 0 3.135-2.211C12.92 9.644 14.5 7.65 14.5 5.5c0-1.836-1.414-3-2.75-3-1.373 0-2.609.986-3.029 2.456a.749.749 0 0 1-1.442 0C6.859 3.486 5.623 2.5 4.25 2.5Z"/></svg>,
    },
  ];

  return (
    <div>
      {/* Repo header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 text-lg mb-1">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted">
            <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
          </svg>
          <Link to={`/user/${npubFromPubkey(pubkey!)}`} className="text-accent hover:underline text-lg">{authorName}</Link>
          <span className="text-text-muted">/</span>
          <span className="text-accent font-semibold text-lg">{repo.name}</span>
          {repo.isPersonalFork && (
            <span className="Label text-[10px] bg-orange/15 text-orange border-orange/30">fork</span>
          )}
        </div>
        {upstreamLink && (
          <p className="text-xs text-text-muted ml-6">
            forked from{" "}
            <Link to={`/repo/${upstreamLink.pubkey}/${upstreamLink.identifier}`} className="text-accent">
              {upstreamLink.identifier}
            </Link>
          </p>
        )}
        {repo.description && <p className="text-text-secondary text-sm mt-1">{repo.description}</p>}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {repo.tags.map((tag) => (
            <span key={tag} className="Label bg-accent/10 text-accent border-accent/20">{tag}</span>
          ))}
        </div>
      </div>

      {/* CI Status badges */}
      <CIStatusBadge repoPubkey={repo.pubkey} identifier={repo.identifier} />

      {/* Action buttons */}
      <div className="flex items-center gap-2 mb-4">
        <StarButton targetId={repo.id} targetPubkey={repo.pubkey} />
        <ZapButton targetId={repo.id} targetPubkey={repo.pubkey} lud16={authorProfile?.lud16} />
        {auth.pubkey && !repo.isPersonalFork && auth.pubkey !== repo.pubkey && (
          <Link
            to={`/repo/${pubkey}/${identifier}/fork`}
            className="btn btn-sm no-underline hover:no-underline"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/>
            </svg>
            Fork
          </Link>
        )}
        {auth.pubkey && (
          <button
            onClick={() => {
              const key = `pinned-repos-${auth.pubkey}`;
              const list: string[] = JSON.parse(localStorage.getItem(key) || "[]");
              const repoKey = `${pubkey}:${identifier}`;
              const newList = pinned ? list.filter((k) => k !== repoKey) : [...list, repoKey];
              localStorage.setItem(key, JSON.stringify(newList));
              setPinned(!pinned);
            }}
            className={`btn btn-sm ${pinned ? "text-accent" : ""}`}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
              <path d="M4.456.734a1.75 1.75 0 0 1 2.826.504l.613 1.327a3.081 3.081 0 0 0 2.084 1.707l2.454.584c1.332.317 1.8 1.972.832 2.94L11.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06L10 11.06l-2.204 2.205c-.968.968-2.623.5-2.94-.832l-.584-2.454a3.081 3.081 0 0 0-1.707-2.084l-1.327-.613a1.75 1.75 0 0 1-.504-2.826Z"/>
            </svg>
            {pinned ? "Pinned" : "Pin"}
          </button>
        )}
        {auth.pubkey === repo.pubkey && (
          <Link to={`/repo/${pubkey}/${identifier}/settings`} className="btn btn-sm no-underline hover:no-underline">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294a6.57 6.57 0 0 1 0 .772c-.01.147.04.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.3-.071l-1.102.302c-.644.177-1.392-.02-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.049-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.04-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.212-.224L5.84 1.29c.168-.645.715-1.196 1.458-1.26A8.006 8.006 0 0 1 8 0ZM5.5 8a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0Z" />
            </svg>
            Settings
          </Link>
        )}
      </div>

      {/* UnderlineNav tabs */}
      <div className="UnderlineNav mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`UnderlineNav-item ${activeTab === tab.id ? "selected" : ""}`}
            aria-selected={activeTab === tab.id}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span className="Counter">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "code" && (
        <div className="space-y-4">
          <RepoRefs repoState={repoState} />

          {/* Source toggle — only show when both options are available */}
          {repo.cloneUrls.length > 0 && (
            <div className="flex items-center gap-1 bg-bg-tertiary rounded-lg p-1 w-fit">
              <button
                onClick={() => setCodeSource("git")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer border-0 transition-colors ${
                  codeSource === "git"
                    ? "bg-accent text-white"
                    : "bg-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                Code
              </button>
              <button
                onClick={() => setCodeSource("nostr")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer border-0 transition-colors ${
                  codeSource === "nostr"
                    ? "bg-accent text-white"
                    : "bg-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                Nostr Files
              </button>
            </div>
          )}

          {repo.isPersonalFork && repo.upstreamAddress && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowForkDiff(!showForkDiff)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg cursor-pointer transition-colors ${
                  showForkDiff
                    ? "bg-accent/15 text-accent border-accent/30"
                    : "border-border text-text-secondary bg-transparent hover:border-text-muted hover:text-text-primary"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1.5 1.75V13.5h13.75a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75V1.75a.75.75 0 0 1 1.5 0Zm14.28 2.53-5.25 5.25a.75.75 0 0 1-1.06 0L7 7.06 4.28 9.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.25-3.25a.75.75 0 0 1 1.06 0L10 7.94l4.72-4.72a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z" />
                </svg>
                {showForkDiff ? "Hide comparison" : "Compare with upstream"}
              </button>
            </div>
          )}

          {showForkDiff && repo.isPersonalFork && repo.upstreamAddress && (
            <ForkDiffView
              upstreamAddress={repo.upstreamAddress}
              forkAddress={repoAddress(pubkey!, identifier!)}
            />
          )}

          {codeSource === "git" ? (
            <CodeBrowser
              cloneUrls={repo.cloneUrls}
              repoId={`${repo.pubkey.slice(0, 8)}-${repo.identifier}`}
              repoPubkey={repo.pubkey}
              repoIdentifier={repo.identifier}
              repoName={repo.name}
              repoDescription={repo.description}
              repoTags={repo.tags}
              showCommitHistory
            />
          ) : (
            <NostrCodeBrowser
              repoAddress={repoAddress(pubkey!, identifier!)}
              repoPubkey={pubkey!}
            />
          )}

          {repo.cloneUrls.length > 0 && (
            <div className="Box">
              <div className="Box-header py-2 px-4">
                <h3 className="text-sm font-medium">Clone</h3>
              </div>
              {repo.cloneUrls.map((url) => (
                <div key={url} className="Box-row flex items-center gap-2">
                  <code className="text-xs bg-bg-primary px-3 py-1.5 rounded border border-border flex-1 font-mono truncate">
                    git clone {url}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(`git clone ${url}`); setCopied(url); setTimeout(() => setCopied(""), 2000); }}
                    className="btn btn-sm shrink-0"
                    data-tooltip={copied === url ? "Copied!" : "Copy"}
                  >
                    {copied === url ? (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-green"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" /></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" /><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" /></svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {repo.webUrls.length > 0 && (
            <div className="Box">
              <div className="Box-header py-2 px-4">
                <h3 className="text-sm font-medium">Browse Online</h3>
              </div>
              {repo.webUrls.filter((url) => { try { const p = new URL(url); return p.protocol === "https:" || p.protocol === "http:"; } catch { return false; } }).map((url) => (
                <div key={url} className="Box-row">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent">
                    {url}
                  </a>
                </div>
              ))}
            </div>
          )}

          <div className="Box">
            <div className="Box-header py-2 px-4">
              <h3 className="text-sm font-medium">About</h3>
            </div>
            <div className="p-4 grid grid-cols-2 gap-2 text-sm">
              <div className="text-text-secondary">Announced</div>
              <div>{timeAgo(repo.createdAt)}</div>
              <div className="text-text-secondary">Maintainers</div>
              <div>
                {repo.maintainers.length > 0
                  ? repo.maintainers.map((m) => shortenKey(m)).join(", ")
                  : authorName}
              </div>
              {repo.earliestUniqueCommit && (
                <>
                  <div className="text-text-secondary">EUC</div>
                  <div className="font-mono text-xs">{repo.earliestUniqueCommit.slice(0, 12)}</div>
                </>
              )}
              <div className="text-text-secondary">Relays</div>
              <div className="text-xs">
                {repo.relays.length > 0 ? repo.relays.join(", ") : DEFAULT_RELAYS.slice(0, 2).join(", ")}
              </div>
            </div>
          </div>

          {/* Contributors */}
          {(() => {
            const contributorPubkeys = [...new Set([
              repo.pubkey,
              ...allIssues.map((i) => i.pubkey),
              ...allPatches.map((p) => p.pubkey),
              ...allPrs.map((p) => p.pubkey),
            ])];
            return contributorPubkeys.length > 0 && (
              <div className="Box">
                <div className="Box-header py-2 px-4">
                  <h3 className="text-sm font-medium">Contributors <span className="Counter">{contributorPubkeys.length}</span></h3>
                </div>
                <div className="p-4 flex flex-wrap gap-2">
                  {contributorPubkeys.slice(0, 20).map((pk) => {
                    const p = profiles.get(pk);
                    return (
                      <Link key={pk} to={`/user/${npubFromPubkey(pk)}`} data-tooltip={p?.name ?? shortenKey(pk)}>
                        {p?.picture ? (
                          <img src={p.picture} alt="" className="w-8 h-8 rounded-full border border-border hover:ring-2 hover:ring-accent" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center text-text-muted text-xs border border-border hover:ring-2 hover:ring-accent">
                            {(p?.name ?? "?")[0].toUpperCase()}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {activeTab === "issues" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-text-secondary">
              {allIssues.length} issues
              {newIssueCount > 0 && (
                <button onClick={flushIssues} className="ml-2 text-xs text-accent hover:underline bg-transparent border-0 cursor-pointer">
                  {newIssueCount} new
                </button>
              )}
            </div>
            <Link
              to={`/repo/${pubkey}/${identifier}/issues/new`}
              className="btn btn-primary btn-sm no-underline hover:no-underline"
            >
              New Issue
            </Link>
          </div>
          {allIssues.length === 0 ? (
            <div className="Blankslate Box">
              <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted mx-auto mb-2">
                <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>
              </svg>
              <p>No issues yet</p>
            </div>
          ) : (
            <div className="Box">
              {allIssues.sort((a, b) => b.createdAt - a.createdAt).map((issue) => {
                const status = getLatestStatus(issue.id);
                const profile = profiles.get(issue.pubkey);
                return (
                  <Link key={issue.id} to={`/repo/${pubkey}/${identifier}/issues/${issue.id}`}
                    className="Box-row flex items-start gap-3 no-underline hover:no-underline">
                    <StatusBadge kind={status} className="mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-text-primary font-medium hover:text-accent">{issue.subject}</span>
                      <div className="text-xs text-text-muted mt-0.5">
                        opened {timeAgo(issue.createdAt)} by {profile?.name ?? shortenKey(issue.pubkey)}
                      </div>
                      {issue.labels.length > 0 && (
                        <div className="flex gap-1.5 mt-1">
                          {issue.labels.map((l) => (
                            <span key={l} className="Label bg-accent/10 text-accent border-accent/20 text-[10px]">{l}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "patches" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-text-secondary">
              {rootPatches.length} patch sets
              {newPatchCount > 0 && (
                <button onClick={flushPatches} className="ml-2 text-xs text-accent hover:underline bg-transparent border-0 cursor-pointer">
                  {newPatchCount} new
                </button>
              )}
            </div>
            <Link
              to={`/repo/${pubkey}/${identifier}/patches/new`}
              className="btn btn-primary btn-sm no-underline hover:no-underline"
            >
              New Patch
            </Link>
          </div>
          {rootPatches.length === 0 ? (
            <div className="Blankslate Box">
              <p>No patches submitted yet</p>
            </div>
          ) : (
            <div className="Box">
              {rootPatches.sort((a, b) => b.createdAt - a.createdAt).map((patch) => {
                const status = getLatestStatus(patch.id);
                const profile = profiles.get(patch.pubkey);
                const subject = patch.content.split("\n").find((l) => l.startsWith("Subject:"))
                  ?.replace("Subject: ", "").replace(/\[PATCH[^\]]*\]\s*/, "") ?? "Untitled patch";
                return (
                  <Link key={patch.id} to={`/repo/${pubkey}/${identifier}/patches/${patch.id}`}
                    className="Box-row flex items-start gap-3 no-underline hover:no-underline">
                    <StatusBadge kind={status} className="mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-text-primary font-medium hover:text-accent">{subject}</span>
                      <div className="text-xs text-text-muted mt-0.5">
                        submitted {timeAgo(patch.createdAt)} by {profile?.name ?? shortenKey(patch.pubkey)}
                      </div>
                      {patch.commitId && (
                        <span className="text-xs font-mono text-text-muted">{patch.commitId.slice(0, 8)}</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "prs" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-text-secondary">
              {allPrs.length} pull requests
              {newPrCount > 0 && (
                <button onClick={flushPrs} className="ml-2 text-xs text-accent hover:underline bg-transparent border-0 cursor-pointer">
                  {newPrCount} new
                </button>
              )}
            </div>
            <Link
              to={`/repo/${pubkey}/${identifier}/prs/new`}
              className="btn btn-primary btn-sm no-underline hover:no-underline"
            >
              New Pull Request
            </Link>
          </div>
          {allPrs.length === 0 ? (
            <div className="Blankslate Box">
              <p>No pull requests yet</p>
            </div>
          ) : (
            <div className="Box">
              {allPrs.sort((a, b) => b.createdAt - a.createdAt).map((pr) => {
                const status = getLatestStatus(pr.id);
                const profile = profiles.get(pr.pubkey);
                return (
                  <Link key={pr.id} to={`/repo/${pubkey}/${identifier}/prs/${pr.id}`}
                    className="Box-row flex items-start gap-3 no-underline hover:no-underline">
                    <StatusBadge kind={status} className="mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-text-primary font-medium hover:text-accent">{pr.subject}</span>
                      <div className="text-xs text-text-muted mt-0.5">
                        opened {timeAgo(pr.createdAt)} by {profile?.name ?? shortenKey(pr.pubkey)}
                      </div>
                      <div className="flex gap-2 mt-1">
                        {pr.branchName && (
                          <span className="Label bg-accent/10 text-accent border-accent/20 font-mono text-[10px]">{pr.branchName}</span>
                        )}
                        {pr.labels.map((l) => (
                          <span key={l} className="Label bg-accent/10 text-accent border-accent/20 text-[10px]">{l}</span>
                        ))}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "discussions" && (
        <div className="text-center py-10">
          <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted mx-auto mb-3">
            <path d="M1.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 10.25 10H7.061l-2.574 2.573A1.458 1.458 0 0 1 2 11.543V10h-.25A1.75 1.75 0 0 1 0 8.25v-5.5C0 1.784.784 1 1.75 1ZM1.5 2.75v5.5c0 .138.112.25.25.25h1a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h3.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Z"/>
          </svg>
          <p className="text-text-secondary mb-3">Ask questions, share ideas, and collaborate with the community.</p>
          <Link
            to={`/repo/${pubkey}/${identifier}/discussions`}
            className="btn btn-primary no-underline hover:no-underline"
          >
            Go to Discussions
          </Link>
        </div>
      )}


      {activeTab === "bounties" && (
        <div className="text-center py-10">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted mx-auto mb-3">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          <p className="text-text-secondary mb-3">Post and claim bounties for work on this repository.</p>
          <Link
            to={`/repo/${pubkey}/${identifier}/bounties`}
            className="btn btn-primary no-underline hover:no-underline"
          >
            Go to Bounties
          </Link>
        </div>
      )}

      {activeTab === "releases" && (
        <div>
          <div className="text-sm text-text-secondary mb-4">
            Tags and releases from the repository
          </div>
          {repoState && Object.keys(repoState.refs).filter((r) => r.startsWith("refs/tags/")).length > 0 ? (
            <div className="Box">
              {Object.entries(repoState.refs)
                .filter(([ref]) => ref.startsWith("refs/tags/"))
                .map(([ref, sha]) => {
                  const tagName = ref.replace("refs/tags/", "");
                  return (
                    <div key={ref} className="Box-row flex items-center gap-3">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-green shrink-0">
                        <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/>
                      </svg>
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-text-primary">{tagName}</span>
                        <span className="text-xs font-mono text-text-muted ml-2">{sha.slice(0, 10)}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="Blankslate Box">
              <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted mx-auto mb-2">
                <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/>
              </svg>
              <p>No tags or releases yet</p>
              <p className="text-xs text-text-muted mt-1">Tags from the repo state announcement will appear here</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "boards" && (
        <div className="text-center py-10">
          <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted mx-auto mb-3">
            <path d="M1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25V1.75C0 .784.784 0 1.75 0ZM1.5 1.75v12.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25ZM11.75 3a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-1.5 0v-7.5a.75.75 0 0 1 .75-.75Zm-8.25.75a.75.75 0 0 1 1.5 0v5.5a.75.75 0 0 1-1.5 0ZM8 3a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 3Z"/>
          </svg>
          <p className="text-text-secondary mb-3">Organize work with kanban-style project boards.</p>
          <Link
            to={`/repo/${pubkey}/${identifier}/boards`}
            className="btn btn-primary no-underline hover:no-underline"
          >
            Go to Boards
          </Link>
        </div>
      )}

      {activeTab === "insights" && (
        <div className="text-center py-10">
          <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted mx-auto mb-3">
            <path d="M1.5 1.75V13.5h13.75a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75V1.75a.75.75 0 0 1 1.5 0Zm14.28 2.53-5.25 5.25a.75.75 0 0 1-1.06 0L7 7.06 4.28 9.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.25-3.25a.75.75 0 0 1 1.06 0L10 7.94l4.72-4.72a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"/>
          </svg>
          <p className="text-text-secondary mb-3">View contribution activity and repository analytics.</p>
          <Link
            to={`/repo/${pubkey}/${identifier}/insights`}
            className="btn btn-primary no-underline hover:no-underline"
          >
            Go to Insights
          </Link>
        </div>
      )}

      {activeTab === "changelog" && (
        <div className="text-center py-10">
          <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted mx-auto mb-3">
            <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/>
          </svg>
          <p className="text-text-secondary mb-3">Track release notes and version history.</p>
          <Link
            to={`/repo/${pubkey}/${identifier}/changelog`}
            className="btn btn-primary no-underline hover:no-underline"
          >
            Go to Changelog
          </Link>
        </div>
      )}

      {activeTab === "sponsor" && (
        <SponsorTab
          repoPubkey={repo.pubkey}
          repoAddress={repoAddress(pubkey!, identifier!)}
          profiles={profiles}
        />
      )}
    </div>
  );
}
