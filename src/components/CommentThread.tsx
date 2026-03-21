import { useState } from "react";
import type { CommentEvent, UserProfile } from "../types/nostr";
import { shortenKey, timeAgo } from "../lib/nostr";
import MarkdownContent from "./MarkdownContent";
import MarkdownEditor from "./MarkdownEditor";
import CommentReactions from "./CommentReactions";
import { useAuth } from "../hooks/useAuth";
import { publishComment } from "../lib/nostr";
import { useToast } from "./Toast";

interface Props {
  comments: CommentEvent[];
  rootId: string;
  rootKind: number;
  rootPubkey: string;
  repoAddress?: string;
  profiles: Map<string, UserProfile>;
  onCommentAdded?: () => void;
}

export default function CommentThread({
  comments,
  rootId,
  rootKind,
  rootPubkey,
  repoAddress,
  profiles,
  onCommentAdded,
}: Props) {
  const { pubkey, signer } = useAuth();
  const { toast } = useToast();
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);

  const sorted = [...comments].sort((a, b) => a.createdAt - b.createdAt);

  const handleSubmit = async () => {
    if (!signer || !newComment.trim()) return;
    setPosting(true);
    try {
      await publishComment(signer, {
        rootId,
        rootKind,
        rootPubkey,
        parentId: rootId,
        parentKind: rootKind,
        parentPubkey: rootPubkey,
        content: newComment.trim(),
        repoAddress,
      });
      setNewComment("");
      toast("Comment posted", "success");
      onCommentAdded?.();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to post comment", "error");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-4">
      {sorted.map((comment) => {
        const profile = profiles.get(comment.pubkey);
        const name = profile?.name ?? profile?.displayName ?? shortenKey(comment.pubkey);
        return (
          <div key={comment.id} className="border border-border rounded-lg overflow-hidden">
            <div className="bg-bg-tertiary px-4 py-2 text-sm flex items-center gap-2">
              {profile?.picture && (
                <img src={profile.picture} alt="" className="w-5 h-5 rounded-full" />
              )}
              <span className="font-semibold text-text-primary">{name}</span>
              <span className="text-text-muted">commented {timeAgo(comment.createdAt)}</span>
            </div>
            <div className="px-4 py-3">
              <MarkdownContent content={comment.content} />
            </div>
            <div className="px-4 pb-2">
              <CommentReactions targetId={comment.id} targetPubkey={comment.pubkey} />
            </div>
          </div>
        );
      })}

      {pubkey && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="bg-bg-tertiary px-4 py-2 text-sm text-text-secondary">
            Write a comment
          </div>
          <div className="p-4">
            <MarkdownEditor
              value={newComment}
              onChange={setNewComment}
              placeholder="Leave a comment (Markdown supported)"
              minHeight="h-28"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleSubmit}
                disabled={posting || !newComment.trim()}
                className="px-4 py-1.5 bg-green text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:brightness-110 cursor-pointer disabled:cursor-not-allowed"
              >
                {posting ? "Posting..." : "Comment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
