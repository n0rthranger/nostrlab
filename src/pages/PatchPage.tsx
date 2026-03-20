import { useEffect, useState, useCallback } from "react";
import type { Event } from "nostr-tools";
import { useParams, Link } from "react-router-dom";
import {
  fetchPatches,
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
  PatchEvent,
  CommentEvent,
  StatusEvent,
  UserProfile,
  StatusKind,
} from "../types/nostr";
import { STATUS_OPEN, STATUS_APPLIED, STATUS_CLOSED, PATCH, COMMENT } from "../types/nostr";
import StatusBadge from "../components/StatusBadge";
import InlineDiffView from "../components/InlineDiffView";
import CommentThread from "../components/CommentThread";
import ReviewButton from "../components/ReviewButton";
import ReviewList from "../components/ReviewList";
import { useAuth } from "../hooks/useAuth";
import { useLiveEvents } from "../hooks/useSubscription";

export default function PatchPage() {
  const { pubkey: repoPubkey, identifier, patchId } = useParams();
  const { pubkey: userPubkey, signer } = useAuth();
  const [patch, setPatch] = useState<PatchEvent | null>(null);
  const [comments, setComments] = useState<CommentEvent[]>([]);
  const [statuses, setStatuses] = useState<StatusEvent[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);

  const load = useCallback(async () => {
    if (!repoPubkey || !identifier || !patchId) return;
    const addr = repoAddress(repoPubkey, identifier);
    const [patches, cmts, sts] = await Promise.all([
      fetchPatches(addr),
      fetchComments(patchId),
      fetchStatuses([patchId]),
    ]);
    const found = patches.find((p) => p.id === patchId) ?? null;
    setPatch(found);
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
  }, [repoPubkey, identifier, patchId]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  // Live comments subscription
  const parseLiveComment = useCallback((event: Event): CommentEvent | null => {
    const rootId = event.tags.find((t: string[]) => t[0] === "E")?.[1];
    if (rootId !== patchId) return null;
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
  }, [patchId]);

  const [sinceTs] = useState(() => Math.floor(Date.now() / 1000));
  const { events: liveComments } = useLiveEvents(
    DEFAULT_RELAYS,
    patchId ? [{ kinds: [COMMENT], "#E": [patchId], since: sinceTs }] : [],
    parseLiveComment,
    { enabled: !!patchId },
  );

  const allComments = (() => {
    const ids = new Set(comments.map((c) => c.id));
    const merged = [...comments];
    for (const lc of liveComments) { if (!ids.has(lc.id)) { merged.push(lc); ids.add(lc.id); } }
    return merged;
  })();

  const currentStatus: StatusKind = (() => {
    if (!patchId) return STATUS_OPEN;
    const relevant = statuses
      .filter((s) => s.targetId === patchId)
      .sort((a, b) => b.createdAt - a.createdAt);
    return relevant.length > 0 ? relevant[0].kind : STATUS_OPEN;
  })();

  const setStatus = async (kind: StatusKind) => {
    if (!signer || !patch || !repoPubkey || !identifier) return;
    await publishStatus(signer, {
      kind,
      targetId: patch.id,
      targetPubkey: patch.pubkey,
      repoAddress: repoAddress(repoPubkey, identifier),
    });
    load();
  };

  const isMaintainer = userPubkey === repoPubkey;

  if (loading) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p>Loading patch...</p>
      </div>
    );
  }

  if (!patch) {
    return <div className="text-center py-20 text-text-secondary">Patch not found</div>;
  }

  const authorProfile = profiles.get(patch.pubkey);
  const authorName = authorProfile?.name ?? shortenKey(patch.pubkey);

  // Parse subject from patch content
  const subjectLine =
    patch.content.split("\n").find((l) => l.startsWith("Subject:"))?.replace("Subject: ", "").replace(/\[PATCH[^\]]*\]\s*/, "") ?? "Untitled patch";

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

      {/* Patch header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-2">{subjectLine}</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <StatusBadge kind={currentStatus} />
          <span className="text-sm text-text-secondary">
            {authorName} submitted {timeAgo(patch.createdAt)}
          </span>
          {patch.commitId && (
            <span className="text-xs font-mono text-text-muted bg-bg-tertiary px-2 py-0.5 rounded">
              {patch.commitId.slice(0, 10)}
            </span>
          )}
          {isMaintainer && currentStatus === STATUS_OPEN && (
            <div className="flex gap-2">
              <button
                onClick={() => setStatus(STATUS_APPLIED)}
                className="text-sm px-3 py-1 rounded-md bg-purple/15 text-purple border border-purple/30 hover:bg-purple/25 cursor-pointer"
              >
                Mark as Applied
              </button>
              <button
                onClick={() => setStatus(STATUS_CLOSED)}
                className="text-sm px-3 py-1 rounded-md border border-border text-text-secondary hover:text-text-primary bg-transparent cursor-pointer"
              >
                Close
              </button>
            </div>
          )}
          <ReviewButton
            targetId={patch.id}
            targetPubkey={patch.pubkey}
            onReviewSubmitted={() => setReviewRefreshKey((k) => k + 1)}
          />
        </div>
      </div>

      {/* Diff with inline comments */}
      <div className="mb-6">
        <InlineDiffView
          patch={patch.content}
          comments={allComments}
          rootId={patch.id}
          rootKind={PATCH}
          rootPubkey={patch.pubkey}
          repoAddress={patch.repoAddress}
          profiles={profiles}
          onCommentAdded={load}
        />
      </div>

      {/* Reviews */}
      <ReviewList targetId={patch.id} refreshKey={reviewRefreshKey} />

      {/* General comments (exclude inline diff comments) */}
      <CommentThread
        comments={allComments.filter((c) => !c.filePath)}
        rootId={patch.id}
        rootKind={PATCH}
        rootPubkey={patch.pubkey}
        repoAddress={patch.repoAddress}
        profiles={profiles}
        onCommentAdded={load}
      />
    </div>
  );
}
