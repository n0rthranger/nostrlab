import { useEffect, useState, useCallback } from "react";
import type { Event } from "nostr-tools";
import { useParams, Link } from "react-router-dom";
import {
  fetchIssues,
  fetchComments,
  fetchStatuses,
  fetchProfiles,
  publishStatus,
  shortenKey,
  timeAgo,
  repoAddress,
  DEFAULT_RELAYS,
} from "../lib/nostr";
import type {
  IssueEvent,
  CommentEvent,
  StatusEvent,
  UserProfile,
  StatusKind,
} from "../types/nostr";
import { STATUS_OPEN, STATUS_CLOSED, ISSUE, COMMENT } from "../types/nostr";
import StatusBadge from "../components/StatusBadge";
import MarkdownContent from "../components/MarkdownContent";
import CommentThread from "../components/CommentThread";
import { useAuth } from "../hooks/useAuth";
import { useLiveEvents } from "../hooks/useSubscription";

export default function IssuePage() {
  const { pubkey: repoPubkey, identifier, issueId } = useParams();
  const { pubkey: userPubkey, signer } = useAuth();
  const [issue, setIssue] = useState<IssueEvent | null>(null);
  const [comments, setComments] = useState<CommentEvent[]>([]);
  const [statuses, setStatuses] = useState<StatusEvent[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!repoPubkey || !identifier || !issueId) return;
    const addr = repoAddress(repoPubkey, identifier);
    const [issues, cmts, sts] = await Promise.all([
      fetchIssues(addr),
      fetchComments(issueId),
      fetchStatuses([issueId]),
    ]);
    const found = issues.find((i) => i.id === issueId) ?? null;
    setIssue(found);
    setComments(cmts);
    setStatuses(sts);

    const pubkeys = [
      repoPubkey,
      ...(found ? [found.pubkey] : []),
      ...cmts.map((c) => c.pubkey),
    ];
    const profs = await fetchProfiles(pubkeys);
    setProfiles(profs);
    setLoading(false);
  }, [repoPubkey, identifier, issueId]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  // Live comments subscription
  const parseComment = useCallback((event: Event): CommentEvent | null => {
    const rootId = event.tags.find((t: string[]) => t[0] === "E")?.[1];
    if (rootId !== issueId) return null;
    return {
      id: event.id, pubkey: event.pubkey, content: event.content,
      rootId: rootId ?? "", rootKind: parseInt(event.tags.find((t: string[]) => t[0] === "K")?.[1] ?? "0", 10) || 0,
      parentId: event.tags.find((t: string[]) => t[0] === "e")?.[1] ?? "",
      parentKind: parseInt(event.tags.find((t: string[]) => t[0] === "k")?.[1] ?? "0", 10) || 0,
      createdAt: event.created_at,
    };
  }, [issueId]);

  const [sinceTs] = useState(() => Math.floor(Date.now() / 1000));
  const { events: liveComments } = useLiveEvents(
    DEFAULT_RELAYS,
    issueId ? [{ kinds: [COMMENT], "#E": [issueId], since: sinceTs }] : [],
    parseComment,
    { enabled: !!issueId },
  );

  // Merge live comments with initial fetch
  const allComments = (() => {
    const ids = new Set(comments.map((c) => c.id));
    const merged = [...comments];
    for (const lc of liveComments) {
      if (!ids.has(lc.id)) { merged.push(lc); ids.add(lc.id); }
    }
    return merged;
  })();

  const currentStatus: StatusKind = (() => {
    if (!issueId) return STATUS_OPEN;
    const relevant = statuses
      .filter((s) => s.targetId === issueId)
      .sort((a, b) => b.createdAt - a.createdAt);
    return relevant.length > 0 ? relevant[0].kind : STATUS_OPEN;
  })();

  const toggleStatus = async () => {
    if (!signer || !issue || !repoPubkey || !identifier) return;
    const newKind = currentStatus === STATUS_OPEN ? STATUS_CLOSED : STATUS_OPEN;
    await publishStatus(signer, {
      kind: newKind,
      targetId: issue.id,
      targetPubkey: issue.pubkey,
      repoAddress: repoAddress(repoPubkey, identifier),
    });
    load();
  };

  const canChangeStatus =
    userPubkey && issue && (userPubkey === issue.pubkey || userPubkey === repoPubkey);

  if (loading) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p>Loading issue...</p>
      </div>
    );
  }

  if (!issue) {
    return <div className="Blankslate"><p>Issue not found</p></div>;
  }

  const authorProfile = profiles.get(issue.pubkey);
  const authorName = authorProfile?.name ?? shortenKey(issue.pubkey);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-3">
        <Link
          to={`/repo/${repoPubkey}/${identifier}`}
          className="text-sm text-accent hover:underline"
        >
          {identifier}
        </Link>
        <span className="text-text-muted mx-1">/</span>
        <span className="text-sm text-text-secondary">Issues</span>
      </div>

      {/* Issue header */}
      <div className="pb-4 border-b border-border mb-6">
        <h1 className="text-2xl font-semibold mb-2">
          {issue.subject}
          <span className="text-text-muted font-light ml-2">#{issue.id.slice(0, 7)}</span>
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <StatusBadge kind={currentStatus} size="md" />
          <span className="text-sm text-text-secondary">
            <span className="font-medium text-text-primary">{authorName}</span> opened this issue {timeAgo(issue.createdAt)}
          </span>
          <span className="text-sm text-text-muted">
            · {allComments.length} comment{allComments.length !== 1 ? "s" : ""}
          </span>
          {canChangeStatus && (
            <button onClick={toggleStatus} className="btn btn-sm ml-auto">
              {currentStatus === STATUS_OPEN ? "Close issue" : "Reopen issue"}
            </button>
          )}
        </div>
        {issue.labels.length > 0 && (
          <div className="flex gap-1.5 mt-3">
            {issue.labels.map((l) => (
              <span key={l} className="Label bg-accent/10 text-accent border-accent/20">
                {l}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Issue body */}
      <div className="Box mb-4">
        <div className="Box-header flex items-center gap-2 py-2 px-4">
          {authorProfile?.picture ? (
            <img src={authorProfile.picture} alt="" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-bg-tertiary flex items-center justify-center text-text-muted text-[10px]">?</div>
          )}
          <span className="font-semibold text-sm text-text-primary">{authorName}</span>
          <span className="text-xs text-text-muted">commented {timeAgo(issue.createdAt)}</span>
        </div>
        <div className="px-4 py-3 markdown-body">
          <MarkdownContent content={issue.content} />
        </div>
      </div>

      {/* Comments */}
      <CommentThread
        comments={allComments}
        rootId={issue.id}
        rootKind={ISSUE}
        rootPubkey={issue.pubkey}
        repoAddress={issue.repoAddress}
        profiles={profiles}
        onCommentAdded={load}
      />
    </div>
  );
}
