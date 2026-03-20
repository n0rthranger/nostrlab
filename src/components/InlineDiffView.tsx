import { useState } from "react";
import { parseDiff, lineKey } from "../lib/diff";
import type { CommentEvent, UserProfile } from "../types/nostr";
import { useAuth } from "../hooks/useAuth";
import { publishComment, shortenKey, timeAgo } from "../lib/nostr";
import MarkdownContent from "./MarkdownContent";

interface Props {
  patch: string;
  comments: CommentEvent[];
  rootId: string;
  rootKind: number;
  rootPubkey: string;
  repoAddress?: string;
  profiles: Map<string, UserProfile>;
  onCommentAdded?: () => void;
}

export default function InlineDiffView({
  patch, comments, rootId, rootKind, rootPubkey, repoAddress, profiles, onCommentAdded,
}: Props) {
  const { pubkey, signer } = useAuth();
  const [commentingAt, setCommentingAt] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);

  const files = parseDiff(patch);

  // Group inline comments by file:side:line
  const inlineComments = new Map<string, CommentEvent[]>();
  for (const c of comments) {
    if (c.filePath && c.lineNumber !== undefined) {
      const key = lineKey(c.filePath, c.lineNumber, c.diffSide ?? "new");
      const list = inlineComments.get(key) ?? [];
      list.push(c);
      inlineComments.set(key, list);
    }
  }

  const handlePostComment = async (filePath: string, lineNumber: number, side: "old" | "new") => {
    if (!signer || !commentText.trim()) return;
    setPosting(true);
    try {
      await publishComment(signer, {
        rootId, rootKind, rootPubkey,
        parentId: rootId, parentKind: rootKind, parentPubkey: rootPubkey,
        content: commentText.trim(), repoAddress,
        filePath, lineNumber, diffSide: side,
      });
      setCommentText("");
      setCommentingAt(null);
      onCommentAdded?.();
    } catch {
      // error handled silently — posting state reset below
    } finally {
      setPosting(false);
    }
  };

  if (files.length === 0) {
    // Fallback to simple diff view
    return (
      <div className="font-mono text-xs overflow-x-auto border border-border rounded-lg">
        {patch.split("\n").map((line, i) => {
          let bg = "";
          let textColor = "text-text-primary";
          if (line.startsWith("+") && !line.startsWith("+++")) { bg = "bg-green-subtle"; textColor = "text-green"; }
          else if (line.startsWith("-") && !line.startsWith("---")) { bg = "bg-red-subtle"; textColor = "text-red"; }
          else if (line.startsWith("@@")) { textColor = "text-accent"; bg = "bg-accent/5"; }
          else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) { textColor = "text-text-muted"; }
          return <div key={i} className={`px-4 py-0 whitespace-pre ${bg} ${textColor}`}>{line}</div>;
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {files.map((file, fi) => (
        <div key={fi} className="border border-border rounded-lg overflow-hidden">
          {/* File header */}
          <div className="bg-bg-tertiary px-4 py-2 text-sm font-mono text-text-secondary border-b border-border flex items-center gap-2">
            {file.oldName === "/dev/null" ? (
              <span className="text-green">+ {file.newName}</span>
            ) : file.newName === "/dev/null" ? (
              <span className="text-red">- {file.oldName}</span>
            ) : file.oldName !== file.newName ? (
              <span>{file.oldName} → {file.newName}</span>
            ) : (
              <span>{file.newName}</span>
            )}
          </div>

          {/* Hunks */}
          <div className="font-mono text-xs overflow-x-auto">
            {file.hunks.map((hunk, hi) => (
              <div key={hi}>
                {hunk.lines.map((line, li) => {
                  if (line.type === "header") {
                    return (
                      <div key={li} className="px-4 py-0 whitespace-pre text-accent bg-accent/5">
                        {line.content}
                      </div>
                    );
                  }

                  const lineNo = line.type === "remove" ? line.oldLineNo : line.newLineNo;
                  const side = line.type === "remove" ? "old" : "new";
                  const key = lineNo !== undefined ? lineKey(side === "old" ? file.oldName : file.newName, lineNo, side) : null;
                  const lineComments = key ? inlineComments.get(key) ?? [] : [];
                  const isCommenting = commentingAt === key;

                  let bg = "";
                  let textColor = "text-text-primary";
                  if (line.type === "add") { bg = "bg-green-subtle"; textColor = "text-green"; }
                  else if (line.type === "remove") { bg = "bg-red-subtle"; textColor = "text-red"; }

                  return (
                    <div key={li}>
                      <div className={`flex items-stretch ${bg} group`}>
                        {/* Comment button gutter */}
                        <div className="w-5 shrink-0 flex items-center justify-center">
                          {pubkey && lineNo !== undefined && (
                            <button
                              onClick={() => {
                                setCommentingAt(isCommenting ? null : key);
                                setCommentText("");
                              }}
                              className="w-4 h-4 rounded bg-accent text-white text-[10px] leading-none opacity-0 group-hover:opacity-100 cursor-pointer border-0 flex items-center justify-center"
                              title="Add comment"
                            >
                              +
                            </button>
                          )}
                        </div>
                        {/* Line numbers */}
                        <div className="w-10 shrink-0 text-right pr-1 text-text-muted select-none">
                          {line.oldLineNo ?? ""}
                        </div>
                        <div className="w-10 shrink-0 text-right pr-2 text-text-muted select-none border-r border-border/50">
                          {line.newLineNo ?? ""}
                        </div>
                        {/* Content */}
                        <div className={`px-2 py-0 whitespace-pre flex-1 ${textColor}`}>
                          {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                          {line.content}
                        </div>
                      </div>

                      {/* Inline comments */}
                      {lineComments.length > 0 && (
                        <div className="bg-bg-secondary border-y border-border">
                          {lineComments.sort((a, b) => a.createdAt - b.createdAt).map((c) => {
                            const profile = profiles.get(c.pubkey);
                            return (
                              <div key={c.id} className="px-6 py-2 border-b border-border/50 last:border-0">
                                <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
                                  {profile?.picture && <img src={profile.picture} alt="" className="w-4 h-4 rounded-full" />}
                                  <span className="font-semibold text-text-primary">
                                    {profile?.name ?? shortenKey(c.pubkey)}
                                  </span>
                                  <span>{timeAgo(c.createdAt)}</span>
                                </div>
                                <div className="text-sm">
                                  <MarkdownContent content={c.content} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Comment form */}
                      {isCommenting && key && (
                        <div className="bg-bg-secondary border-y border-border p-3">
                          <textarea
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder="Write a comment..."
                            className="w-full h-20 bg-bg-primary border border-border rounded-md p-2 text-sm text-text-primary resize-y focus:outline-none focus:border-accent"
                            autoFocus
                          />
                          <div className="flex justify-end gap-2 mt-2">
                            <button
                              onClick={() => { setCommentingAt(null); setCommentText(""); }}
                              className="px-3 py-1 text-sm text-text-secondary hover:text-text-primary cursor-pointer bg-transparent border border-border rounded"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => lineNo !== undefined && handlePostComment(side === "old" ? file.oldName : file.newName, lineNo, side)}
                              disabled={posting || !commentText.trim()}
                              className="px-3 py-1 text-sm bg-green text-white rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {posting ? "Posting..." : "Comment"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
