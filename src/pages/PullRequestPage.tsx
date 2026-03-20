import { useEffect, useState, useCallback } from "react";
import type { Event } from "nostr-tools";
import { useParams, Link } from "react-router-dom";
import {
  fetchPullRequests,
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
  PullRequestEvent,
  CommentEvent,
  StatusEvent,
  UserProfile,
  StatusKind,
} from "../types/nostr";
import { STATUS_OPEN, STATUS_APPLIED, STATUS_CLOSED, PULL_REQUEST, COMMENT } from "../types/nostr";
import StatusBadge from "../components/StatusBadge";
import MarkdownContent from "../components/MarkdownContent";
import CommentThread from "../components/CommentThread";
import InlineDiffView from "../components/InlineDiffView";
import ReviewButton from "../components/ReviewButton";
import ReviewList from "../components/ReviewList";
import { useAuth } from "../hooks/useAuth";
import { useLiveEvents } from "../hooks/useSubscription";

export default function PullRequestPage() {
  const { pubkey: repoPubkey, identifier, prId } = useParams();
  const { pubkey: userPubkey, signer } = useAuth();
  const [pr, setPr] = useState<PullRequestEvent | null>(null);
  const [comments, setComments] = useState<CommentEvent[]>([]);
  const [statuses, setStatuses] = useState<StatusEvent[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);

  const load = useCallback(async () => {
    if (!repoPubkey || !identifier || !prId) return;
    const addr = repoAddress(repoPubkey, identifier);
    const [prs, cmts, sts] = await Promise.all([
      fetchPullRequests(addr),
      fetchComments(prId),
      fetchStatuses([prId]),
    ]);
    const found = prs.find((p) => p.id === prId) ?? null;
    setPr(found);
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
  }, [repoPubkey, identifier, prId]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  // Live comments subscription
  const parseLiveComment = useCallback((event: Event): CommentEvent | null => {
    const rootId = event.tags.find((t: string[]) => t[0] === "E")?.[1];
    if (rootId !== prId) return null;
    const fileTag = event.tags.find((t: string[]) => t[0] === "file");
    const lineTag = event.tags.find((t: string[]) => t[0] === "line");
    return {
      id: event.id, pubkey: event.pubkey, content: event.content,
      rootId: rootId ?? "", rootKind: parseInt(event.tags.find((t: string[]) => t[0] === "K")?.[1] ?? "0", 10) || 0,
      parentId: event.tags.find((t: string[]) => t[0] === "e")?.[1] ?? "",
      parentKind: parseInt(event.tags.find((t: string[]) => t[0] === "k")?.[1] ?? "0", 10) || 0,
      createdAt: event.created_at,
      filePath: fileTag?.[1],
      lineNumber: lineTag ? (parseInt(lineTag[1], 10) || undefined) : undefined,
      diffSide: lineTag?.[2] as "old" | "new" | undefined,
    };
  }, [prId]);

  const [sinceTs] = useState(() => Math.floor(Date.now() / 1000));
  const { events: liveComments } = useLiveEvents(
    DEFAULT_RELAYS,
    prId ? [{ kinds: [COMMENT], "#E": [prId], since: sinceTs }] : [],
    parseLiveComment,
    { enabled: !!prId },
  );

  const allComments = (() => {
    const ids = new Set(comments.map((c) => c.id));
    const merged = [...comments];
    for (const lc of liveComments) { if (!ids.has(lc.id)) { merged.push(lc); ids.add(lc.id); } }
    return merged;
  })();

  const currentStatus: StatusKind = (() => {
    if (!prId) return STATUS_OPEN;
    const relevant = statuses
      .filter((s) => s.targetId === prId)
      .sort((a, b) => b.createdAt - a.createdAt);
    return relevant.length > 0 ? relevant[0].kind : STATUS_OPEN;
  })();

  const setStatusKind = async (kind: StatusKind) => {
    if (!signer || !pr || !repoPubkey || !identifier) return;
    await publishStatus(signer, {
      kind,
      targetId: pr.id,
      targetPubkey: pr.pubkey,
      repoAddress: repoAddress(repoPubkey, identifier),
    });
    load();
  };

  const isMaintainer = userPubkey === repoPubkey;

  if (loading) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p>Loading pull request...</p>
      </div>
    );
  }

  if (!pr) {
    return <div className="text-center py-20 text-text-secondary">Pull request not found</div>;
  }

  const authorProfile = profiles.get(pr.pubkey);
  const authorName = authorProfile?.name ?? shortenKey(pr.pubkey);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-2">
        <Link
          to={`/repo/${repoPubkey}/${identifier}`}
          className="text-sm text-text-secondary hover:text-accent"
        >
          &larr; Back to {identifier}
        </Link>
      </div>

      {/* PR header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-2">{pr.subject}</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <StatusBadge kind={currentStatus} />
          <span className="text-sm text-text-secondary">
            {authorName} wants to merge {timeAgo(pr.createdAt)}
          </span>
          {pr.branchName && (
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-accent/15 text-accent">
              {pr.branchName}
            </span>
          )}
          <span className="text-xs font-mono text-text-muted bg-bg-tertiary px-2 py-0.5 rounded">
            {pr.commitId.slice(0, 10)}
          </span>
        </div>
        {pr.labels.length > 0 && (
          <div className="flex gap-1.5 mt-2">
            {pr.labels.map((l) => (
              <span key={l} className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                {l}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Maintainer actions and review */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {isMaintainer && currentStatus === STATUS_OPEN && (
          <>
            <button
              onClick={() => setStatusKind(STATUS_APPLIED)}
              className="px-4 py-2 rounded-md bg-purple/15 text-purple border border-purple/30 hover:bg-purple/25 cursor-pointer text-sm font-medium"
            >
              Merge Pull Request
            </button>
            <button
              onClick={() => setStatusKind(STATUS_CLOSED)}
              className="px-4 py-2 rounded-md border border-border text-text-secondary hover:text-text-primary bg-transparent cursor-pointer text-sm"
            >
              Close
            </button>
          </>
        )}
        <ReviewButton
          targetId={pr.id}
          targetPubkey={pr.pubkey}
          onReviewSubmitted={() => setReviewRefreshKey((k) => k + 1)}
        />
      </div>

      {/* Clone info */}
      {pr.cloneUrls.length > 0 && (
        <div className="border border-border rounded-lg p-4 bg-bg-secondary mb-6">
          <h3 className="text-sm font-medium mb-2">Checkout this PR</h3>
          {pr.cloneUrls.map((url) => (
            <code key={url} className="text-xs bg-bg-primary px-3 py-1.5 rounded border border-border block mb-1">
              git fetch {url} {pr.branchName ?? pr.commitId}
            </code>
          ))}
        </div>
      )}

      {/* PR body */}
      {pr.content && (
        <div className="border border-border rounded-lg overflow-hidden mb-6">
          <div className="bg-bg-tertiary px-4 py-2 text-sm flex items-center gap-2">
            {authorProfile?.picture && (
              <img src={authorProfile.picture} alt="" className="w-5 h-5 rounded-full" />
            )}
            <span className="font-semibold text-text-primary">{authorName}</span>
            <span className="text-text-muted">{timeAgo(pr.createdAt)}</span>
          </div>
          <div className="px-4 py-3">
            <MarkdownContent content={pr.content} />
          </div>
        </div>
      )}

      {/* Code changes */}
      {pr.content && pr.content.includes("diff --git") && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8.75 1.75V5H12a.75.75 0 0 1 0 1.5H8.75v3.25a.75.75 0 0 1-1.5 0V6.5H4a.75.75 0 0 1 0-1.5h3.25V1.75a.75.75 0 0 1 1.5 0Zm-3.5 9.5a.75.75 0 0 1 0 1.5H2a.75.75 0 0 1 0-1.5Zm9.5 0a.75.75 0 0 1 0 1.5H6.5a.75.75 0 0 1 0-1.5Z" />
            </svg>
            Changes
          </h3>
          <InlineDiffView
            patch={pr.content}
            comments={allComments.filter((c) => c.filePath)}
            rootId={pr.id}
            rootKind={PULL_REQUEST}
            rootPubkey={pr.pubkey}
            repoAddress={pr.repoAddress}
            profiles={profiles}
            onCommentAdded={load}
          />
        </div>
      )}

      {/* Reviews */}
      <ReviewList targetId={pr.id} refreshKey={reviewRefreshKey} />

      {/* Comments */}
      <CommentThread
        comments={allComments.filter((c) => !c.filePath)}
        rootId={pr.id}
        rootKind={PULL_REQUEST}
        rootPubkey={pr.pubkey}
        repoAddress={pr.repoAddress}
        profiles={profiles}
        onCommentAdded={load}
      />
    </div>
  );
}
