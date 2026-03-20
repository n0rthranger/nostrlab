import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  pool,
  fetchProfiles,
  shortenKey,
  timeAgo,
  repoAddress,
  signWith,
  DEFAULT_RELAYS,
} from "../lib/nostr";
import { DISCUSSION, COMMENT } from "../types/nostr";
import type { DiscussionEvent, UserProfile } from "../types/nostr";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";
import MarkdownContent from "../components/MarkdownContent";
import CommentThread from "../components/CommentThread";

export default function DiscussionsPage() {
  const { pubkey: repoPubkey, identifier, discussionId } = useParams();
  const { pubkey: userPubkey, signer } = useAuth();
  const { toast } = useToast();
  const [discussions, setDiscussions] = useState<DiscussionEvent[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("general");

  // Single discussion view
  const [activeDiscussion, setActiveDiscussion] = useState<DiscussionEvent | null>(null);
  const [comments, setComments] = useState<import("../types/nostr").CommentEvent[]>([]);

  const addr = repoPubkey && identifier ? repoAddress(repoPubkey, identifier) : "";

  useEffect(() => {
    if (!addr) return;
    let cancelled = false;

    pool.querySync(DEFAULT_RELAYS, { kinds: [DISCUSSION], "#a": [addr] }).then(async (events) => {
      if (cancelled) return;
      const parsed: DiscussionEvent[] = events.map((e) => ({
        id: e.id,
        pubkey: e.pubkey,
        content: e.content,
        repoAddress: e.tags.find((t) => t[0] === "a")?.[1] ?? "",
        subject: e.tags.find((t) => t[0] === "subject")?.[1] ?? "(no subject)",
        category: e.tags.find((t) => t[0] === "t")?.[1] ?? "general",
        createdAt: e.created_at,
      })).sort((a, b) => b.createdAt - a.createdAt);

      setDiscussions(parsed);

      const pubkeys = [...new Set(parsed.map((d) => d.pubkey))];
      const profs = await fetchProfiles(pubkeys);
      if (!cancelled) setProfiles(profs);

      // If viewing a specific discussion
      if (discussionId) {
        const found = parsed.find((d) => d.id === discussionId);
        setActiveDiscussion(found ?? null);
        if (found) {
          const cmtEvents = await pool.querySync(DEFAULT_RELAYS, { kinds: [COMMENT], "#E": [found.id] });
          const cmts = cmtEvents.map((e) => ({
            id: e.id,
            pubkey: e.pubkey,
            content: e.content,
            rootId: e.tags.find((t) => t[0] === "E")?.[1] ?? "",
            rootKind: parseInt(e.tags.find((t) => t[0] === "K")?.[1] ?? "0", 10),
            parentId: e.tags.find((t) => t[0] === "e")?.[1] ?? "",
            parentKind: parseInt(e.tags.find((t) => t[0] === "k")?.[1] ?? "0", 10),
            createdAt: e.created_at,
          }));
          setComments(cmts);
          const cmtPubkeys = [...new Set(cmtEvents.map((e) => e.pubkey))];
          const cmtProfs = await fetchProfiles(cmtPubkeys);
          if (!cancelled) setProfiles((prev) => new Map([...prev, ...cmtProfs]));
        }
      }

      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [addr, discussionId]);

  const handleCreate = async () => {
    if (!signer || !addr || !newSubject.trim()) return;
    setCreating(true);
    try {
      const event = await signWith(signer, {
        kind: DISCUSSION,
        content: newContent,
        tags: [
          ["a", addr],
          ["subject", newSubject.trim()],
          ["t", newCategory],
          ...(repoPubkey ? [["p", repoPubkey]] : []),
        ],
        created_at: Math.floor(Date.now() / 1000),
      });
      await Promise.allSettled(pool.publish(DEFAULT_RELAYS, event));
      toast("Discussion created!", "success");
      const newDiscussion: DiscussionEvent = {
        id: event.id,
        pubkey: userPubkey!,
        content: newContent,
        repoAddress: addr,
        subject: newSubject.trim(),
        category: newCategory,
        createdAt: event.created_at,
      };
      setDiscussions((prev) => [newDiscussion, ...prev]);
      setNewSubject("");
      setNewContent("");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to create discussion", "error");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p>Loading discussions...</p>
      </div>
    );
  }

  // Single discussion view
  if (activeDiscussion) {
    const author = profiles.get(activeDiscussion.pubkey);
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-3">
          <Link to={`/repo/${repoPubkey}/${identifier}/discussions`} className="text-sm text-accent hover:underline">
            &larr; All Discussions
          </Link>
        </div>
        <h1 className="text-2xl font-semibold mb-2">{activeDiscussion.subject}</h1>
        <div className="flex items-center gap-2 text-sm text-text-muted mb-6">
          <span className="Label bg-accent/10 text-accent border-accent/20 text-xs">{activeDiscussion.category}</span>
          <span>{author?.name ?? shortenKey(activeDiscussion.pubkey)}</span>
          <span>started {timeAgo(activeDiscussion.createdAt)}</span>
        </div>
        <div className="Box mb-4">
          <div className="px-4 py-3">
            <MarkdownContent content={activeDiscussion.content} />
          </div>
        </div>
        <CommentThread
          comments={comments}
          rootId={activeDiscussion.id}
          rootKind={DISCUSSION}
          rootPubkey={activeDiscussion.pubkey}
          repoAddress={activeDiscussion.repoAddress}
          profiles={profiles}
          onCommentAdded={() => {
            // Re-fetch comments for this discussion
            pool.querySync(DEFAULT_RELAYS, { kinds: [COMMENT], "#E": [activeDiscussion.id] }).then((events) => {
              const parsed = events.map((e) => ({
                id: e.id,
                pubkey: e.pubkey,
                content: e.content,
                createdAt: e.created_at,
                rootId: e.tags.find((t) => t[0] === "E")?.[1] ?? "",
                rootKind: parseInt(e.tags.find((t) => t[0] === "K")?.[1] ?? "0"),
                parentId: e.tags.find((t) => t[0] === "e")?.[1] ?? "",
                parentKind: parseInt(e.tags.find((t) => t[0] === "k")?.[1] ?? "0"),
              }));
              setComments(parsed);
            });
          }}
        />
      </div>
    );
  }

  const categories = ["general", "ideas", "q&a", "show-and-tell"];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-3">
        <Link to={`/repo/${repoPubkey}/${identifier}`} className="text-sm text-accent hover:underline">
          &larr; Back to {identifier}
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Discussions</h1>
      </div>

      {/* New discussion form */}
      {signer && (
        <div className="Box mb-6">
          <div className="Box-header py-2 px-4">
            <h2 className="text-sm font-semibold">Start a new discussion</h2>
          </div>
          <div className="p-4 space-y-3">
            <input
              type="text"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="Discussion title"
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setNewCategory(cat)}
                  className={`text-xs px-2.5 py-1 rounded-full cursor-pointer border ${
                    newCategory === cat
                      ? "bg-accent/15 text-accent border-accent/30"
                      : "bg-transparent text-text-muted border-border"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Write your discussion (Markdown supported)"
              rows={4}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-y"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newSubject.trim()}
              className="btn btn-primary"
            >
              {creating ? "Creating..." : "Start Discussion"}
            </button>
          </div>
        </div>
      )}

      {/* Discussion list */}
      {discussions.length === 0 ? (
        <div className="Blankslate Box">
          <p>No discussions yet. Start one above!</p>
        </div>
      ) : (
        <div className="Box">
          {discussions.map((d) => {
            const author = profiles.get(d.pubkey);
            return (
              <Link
                key={d.id}
                to={`/repo/${repoPubkey}/${identifier}/discussions/${d.id}`}
                className="Box-row flex items-start gap-3 no-underline hover:no-underline"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-green shrink-0 mt-0.5">
                  <path d="M1.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 10.25 10H7.061l-2.574 2.573A1.458 1.458 0 0 1 2 11.543V10h-.25A1.75 1.75 0 0 1 0 8.25v-5.5C0 1.784.784 1 1.75 1ZM1.5 2.75v5.5c0 .138.112.25.25.25h1a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h3.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Zm13 2a.25.25 0 0 0-.25-.25h-.5a.75.75 0 0 1 0-1.5h.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 14.25 12H14v1.543a1.458 1.458 0 0 1-2.487 1.03L9.22 12.28a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l2.22 2.22v-2.19a.75.75 0 0 1 .75-.75h1a.25.25 0 0 0 .25-.25Z" />
                </svg>
                <div className="min-w-0 flex-1">
                  <span className="text-text-primary font-medium hover:text-accent">{d.subject}</span>
                  <div className="text-xs text-text-muted mt-0.5">
                    <span className="Label bg-accent/10 text-accent border-accent/20 text-[10px] mr-1">{d.category}</span>
                    {author?.name ?? shortenKey(d.pubkey)} · {timeAgo(d.createdAt)}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
