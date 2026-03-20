import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { Event } from "nostr-tools";
import { fetchComments, fetchProfiles, shortenKey, timeAgo, parseRepoAddress, pool } from "../lib/nostr";
import { DEFAULT_RELAYS } from "../lib/nostr";
import { ISSUE, PATCH, PULL_REQUEST, COMMENT } from "../types/nostr";
import type { CommentEvent, UserProfile } from "../types/nostr";
import MarkdownContent from "../components/MarkdownContent";
import CommentThread from "../components/CommentThread";
import { useRelays } from "../hooks/useRelays";

function kindName(kind: number): string {
  switch (kind) {
    case ISSUE: return "Issue";
    case PATCH: return "Patch";
    case PULL_REQUEST: return "Pull Request";
    case COMMENT: return "Comment";
    default: return "Event";
  }
}

function kindBadgeClass(kind: number): string {
  switch (kind) {
    case ISSUE: return "bg-green/15 text-green border-green/30";
    case PATCH: return "bg-orange/15 text-orange border-orange/30";
    case PULL_REQUEST: return "bg-purple/15 text-purple border-purple/30";
    default: return "bg-accent/15 text-accent border-accent/30";
  }
}

/** Extract root event ID from an event's tags (NIP-22 uppercase E, or lowercase e with markers) */
function getRootEventId(event: Event): string | undefined {
  // NIP-22: uppercase E tag is the root
  const uppercaseE = event.tags.find((t) => t[0] === "E");
  if (uppercaseE?.[1]) return uppercaseE[1];
  // Fallback: lowercase e tags with "root" marker
  const eTags = event.tags.filter((t) => t[0] === "e");
  const rootMarked = eTags.find((t) => t[3] === "root");
  if (rootMarked?.[1]) return rootMarked[1];
  // Fallback: first e tag is likely the root
  if (eTags.length > 0) return eTags[0][1];
  return undefined;
}

function getRepoAddress(event: Event): string | undefined {
  const aTags = event.tags.filter((t) => t[0] === "a").map((t) => t[1]);
  return aTags.find((a) => a?.startsWith("30617:")) ?? aTags[0];
}

function getSubject(event: Event): string | undefined {
  const subjectTag = event.tags.find((t) => t[0] === "subject");
  let subject = subjectTag?.[1];
  if (!subject && event.kind === PATCH) {
    const subjectLine = event.content.split("\n").find((l) => l.startsWith("Subject:"));
    if (subjectLine) {
      subject = subjectLine.replace("Subject: ", "").replace(/\[PATCH[^\]]*\]\s*/, "");
    }
  }
  return subject;
}

export default function EventThreadPage() {
  const { eventId } = useParams();
  const { globalRelays } = useRelays();
  const [event, setEvent] = useState<Event | null>(null);
  const [rootEvent, setRootEvent] = useState<Event | null>(null);
  const [comments, setComments] = useState<CommentEvent[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);

  const relays = globalRelays.length > 0 ? globalRelays : DEFAULT_RELAYS;

  const refreshComments = async () => {
    const threadRoot = rootEvent ?? event;
    if (!threadRoot) return;
    const cmts = await fetchComments(threadRoot.id, relays);
    setComments(cmts);
    const pubkeys = new Set([...cmts.map((c) => c.pubkey)]);
    if (event) pubkeys.add(event.pubkey);
    if (rootEvent) pubkeys.add(rootEvent.pubkey);
    const profs = await fetchProfiles([...pubkeys], relays);
    setProfiles(profs);
  };

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;

    (async () => {
      // Fetch the event by ID
      const events = await pool.querySync(relays, { ids: [eventId] });
      const found = events[0] ?? null;
      if (cancelled) return;
      setEvent(found);

      if (!found) { setLoading(false); return; }

      // If this is a comment, fetch the root/parent event
      let rootEvt: Event | null = null;
      const rootId = getRootEventId(found);
      if (found.kind === COMMENT && rootId && rootId !== found.id) {
        const rootEvents = await pool.querySync(relays, { ids: [rootId] });
        rootEvt = rootEvents[0] ?? null;
        if (cancelled) return;
        setRootEvent(rootEvt);
      }

      // Fetch replies — for comments, get replies to the root so we see the full thread
      const threadRoot = rootEvt ?? found;
      const cmts = await fetchComments(threadRoot.id, relays);
      if (cancelled) return;
      setComments(cmts);

      // Fetch profiles for everyone
      const pubkeys = new Set([found.pubkey, ...cmts.map((c) => c.pubkey)]);
      if (rootEvt) pubkeys.add(rootEvt.pubkey);
      const profs = await fetchProfiles([...pubkeys], relays);
      if (cancelled) return;
      setProfiles(profs);

      setLoading(false);
    })();

    return () => { cancelled = true; };
    // relays is derived from globalRelays
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, globalRelays]);

  if (loading) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p>Loading thread...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="Blankslate Box max-w-2xl mx-auto">
        <h3 className="text-lg font-medium text-text-primary mb-1">Event not found</h3>
        <p>This event could not be found on your connected relays.</p>
        <Link to="/activity" className="btn btn-sm btn-primary mt-4 no-underline hover:no-underline">
          Back to Activity
        </Link>
      </div>
    );
  }

  // If we found the root event, show the thread from root's perspective
  const displayEvent = rootEvent ?? event;
  const isShowingRoot = !!rootEvent;

  const authorProfile = profiles.get(displayEvent.pubkey);
  const authorName = authorProfile?.displayName || authorProfile?.name || shortenKey(displayEvent.pubkey);

  const subject = getSubject(displayEvent);
  const repoAddr = getRepoAddress(displayEvent) || getRepoAddress(event);
  const parsedRepo = repoAddr ? parseRepoAddress(repoAddr) : null;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-3 flex items-center gap-2 text-sm flex-wrap">
        <Link to="/activity" className="text-accent hover:underline">Activity</Link>
        <span className="text-text-muted">/</span>
        <span className={`font-medium ${displayEvent.kind === ISSUE ? "text-green" : displayEvent.kind === PATCH ? "text-orange" : displayEvent.kind === PULL_REQUEST ? "text-purple" : "text-accent"}`}>
          {kindName(displayEvent.kind)}
        </span>
        {parsedRepo && (
          <>
            <span className="text-text-muted">in</span>
            <Link
              to={`/repo/${parsedRepo.pubkey}/${parsedRepo.identifier}`}
              className="text-accent hover:underline"
            >
              {parsedRepo.identifier}
            </Link>
          </>
        )}
      </div>

      {/* Thread header */}
      <div className="pb-4 border-b border-border mb-6">
        <h1 className="text-2xl font-semibold mb-2">
          {subject || `${kindName(displayEvent.kind)} #${displayEvent.id.slice(0, 7)}`}
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${kindBadgeClass(displayEvent.kind)}`}>
            {kindName(displayEvent.kind)}
          </span>
          <span className="text-sm text-text-secondary">
            by <span className="font-medium text-text-primary">{authorName}</span>
          </span>
          <span className="text-sm text-text-muted">{timeAgo(displayEvent.created_at)}</span>
          {comments.length > 0 && (
            <span className="text-sm text-text-muted">
              · {comments.length} {comments.length === 1 ? "comment" : "comments"}
            </span>
          )}
        </div>
      </div>

      {/* If we can link to the full repo page, show a link */}
      {parsedRepo && displayEvent.kind !== COMMENT && (
        <div className="mb-4">
          <Link
            to={
              displayEvent.kind === ISSUE ? `/repo/${parsedRepo.pubkey}/${parsedRepo.identifier}/issues/${displayEvent.id}` :
              displayEvent.kind === PATCH ? `/repo/${parsedRepo.pubkey}/${parsedRepo.identifier}/patches/${displayEvent.id}` :
              displayEvent.kind === PULL_REQUEST ? `/repo/${parsedRepo.pubkey}/${parsedRepo.identifier}/prs/${displayEvent.id}` :
              `/repo/${parsedRepo.pubkey}/${parsedRepo.identifier}`
            }
            className="text-sm text-accent hover:underline"
          >
            View in repository context &rarr;
          </Link>
        </div>
      )}

      {/* Original post body */}
      <div className="Box mb-6">
        <div className="Box-header flex items-center gap-2 py-2 px-4">
          {authorProfile?.picture ? (
            <img src={authorProfile.picture} alt="" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-bg-tertiary flex items-center justify-center text-text-muted text-[10px]">
              {authorName[0].toUpperCase()}
            </div>
          )}
          <span className="font-semibold text-sm text-text-primary">{authorName}</span>
          <span className="text-xs text-text-muted">{timeAgo(displayEvent.created_at)}</span>
          {isShowingRoot && (
            <span className="text-xs text-text-muted ml-auto">Original post</span>
          )}
        </div>
        <div className="px-4 py-3 markdown-body">
          {displayEvent.kind === PATCH ? (
            <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto">{displayEvent.content}</pre>
          ) : (
            <MarkdownContent content={displayEvent.content} />
          )}
        </div>
      </div>

      {/* Highlight the comment that was clicked if we navigated from a comment */}
      {isShowingRoot && (
        <div className="mb-4 p-3 bg-accent/5 border border-accent/20 rounded-lg text-xs text-text-secondary flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-accent shrink-0">
            <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
          </svg>
          You arrived here from a comment in the thread below.
        </div>
      )}

      {/* Comments thread */}
      <h3 className="text-sm font-semibold text-text-secondary mb-3">
        {comments.length} {comments.length === 1 ? "reply" : "replies"}
      </h3>
      <CommentThread
        comments={comments}
        rootId={displayEvent.id}
        rootKind={displayEvent.kind}
        rootPubkey={displayEvent.pubkey}
        repoAddress={repoAddr}
        profiles={profiles}
        onCommentAdded={refreshComments}
      />
    </div>
  );
}
