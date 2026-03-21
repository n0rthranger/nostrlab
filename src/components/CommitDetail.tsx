import { useState, useEffect } from "react";
import { getCommitDetail, readFileAtCommit, gitLog, type CommitDetail as CommitDetailType } from "../lib/git";
import { timeAgo } from "../lib/nostr";

interface Props {
  repoDir: string;
  oid: string;
  onBack: () => void;
}

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 50%, 40%)`;
}

/** Simple line diff between two strings */
function computeDiff(oldText: string, newText: string): { type: "ctx" | "add" | "del"; line: string }[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: { type: "ctx" | "add" | "del"; line: string }[] = [];

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;

  // For large files, just show new content
  if (m + n > 2000) {
    for (const line of newLines) {
      result.push({ type: "add", line });
    }
    return result;
  }

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const ops: { type: "ctx" | "add" | "del"; line: string }[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.push({ type: "ctx", line: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: "add", line: newLines[j - 1] });
      j--;
    } else {
      ops.push({ type: "del", line: oldLines[i - 1] });
      i--;
    }
  }
  ops.reverse();

  // Collapse to show only context around changes
  let lastChangeIdx = -10;
  const contextLines = 3;
  const include = new Set<number>();
  for (let idx = 0; idx < ops.length; idx++) {
    if (ops[idx].type !== "ctx") {
      lastChangeIdx = idx;
      for (let c = Math.max(0, idx - contextLines); c <= Math.min(ops.length - 1, idx + contextLines); c++) {
        include.add(c);
      }
    }
  }

  let lastIncluded = -1;
  for (let idx = 0; idx < ops.length; idx++) {
    if (include.has(idx)) {
      if (lastIncluded >= 0 && idx - lastIncluded > 1) {
        result.push({ type: "ctx", line: `@@` });
      }
      result.push(ops[idx]);
      lastIncluded = idx;
    }
  }

  return result.length > 0 ? result : ops;
}

export default function CommitDetail({ repoDir, oid, onBack }: Props) {
  const [detail, setDetail] = useState<CommitDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<Map<string, { type: "ctx" | "add" | "del"; line: string }[]>>(new Map());
  const [loadingDiff, setLoadingDiff] = useState<string | null>(null);
  const [copiedOid, setCopiedOid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCommitDetail(repoDir, oid)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          setLoading(false);
        }
      })
      .catch(async () => {
        if (cancelled) return;
        // Fallback: try to get basic info from git log
        try {
          const commits = await gitLog(repoDir, 1000);
          const commit = commits.find((c) => c.oid === oid);
          if (commit && !cancelled) {
            setDetail({ ...commit, files: [] });
            setLoading(false);
            return;
          }
        } catch { /* ignore */ }
        if (!cancelled) {
          setError("Commit data unavailable");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [repoDir, oid]);

  const handleToggleFile = async (path: string) => {
    if (expandedFile === path) {
      setExpandedFile(null);
      return;
    }
    setExpandedFile(path);

    if (diffContent.has(path)) return;

    setLoadingDiff(path);
    try {
      const file = detail!.files.find((f) => f.path === path)!;
      let oldText = "";
      let newText = "";

      if (file.type === "delete") {
        oldText = (await readFileAtCommit(repoDir, detail!.parent[0], path)) ?? "";
      } else if (file.type === "add") {
        newText = (await readFileAtCommit(repoDir, oid, path)) ?? "";
      } else {
        oldText = detail!.parent.length > 0
          ? ((await readFileAtCommit(repoDir, detail!.parent[0], path)) ?? "")
          : "";
        newText = (await readFileAtCommit(repoDir, oid, path)) ?? "";
      }

      const diff = file.type === "add"
        ? newText.split("\n").map((l) => ({ type: "add" as const, line: l }))
        : file.type === "delete"
          ? oldText.split("\n").map((l) => ({ type: "del" as const, line: l }))
          : computeDiff(oldText, newText);

      setDiffContent((prev) => new Map(prev).set(path, diff));
    } catch {
      setDiffContent((prev) => new Map(prev).set(path, [{ type: "ctx", line: "Failed to load diff" }]));
    }
    setLoadingDiff(null);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(oid);
    setCopiedOid(true);
    setTimeout(() => setCopiedOid(false), 2000);
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">
        <div className="inline-block w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mb-2" />
        <p>Loading commit...</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="text-center py-8">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-accent hover:underline bg-transparent border-0 cursor-pointer mb-4 p-0 mx-auto"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z" />
          </svg>
          Back to commits
        </button>
        <div className="border border-border rounded-lg p-6 bg-bg-secondary max-w-md mx-auto">
          <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted mx-auto mb-3">
            <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z" />
          </svg>
          <p className="text-sm text-text-primary font-medium mb-1">Commit details unavailable</p>
          <p className="text-xs text-text-muted">
            This commit's data could not be read from the browser clone. This can happen with shallow clones or repos cloned via HTTP proxy.
          </p>
          <code className="text-xs text-text-muted mt-2 block">{oid.slice(0, 12)}</code>
        </div>
      </div>
    );
  }

  const firstLine = detail.message.split("\n")[0];
  const restMessage = detail.message.slice(firstLine.length).trim();
  const initials = detail.author.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const added = detail.files.filter((f) => f.type === "add").length;
  const modified = detail.files.filter((f) => f.type === "modify").length;
  const deleted = detail.files.filter((f) => f.type === "delete").length;

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-accent hover:underline bg-transparent border-0 cursor-pointer mb-4 p-0"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z" />
        </svg>
        Back to commits
      </button>

      {/* Commit header */}
      <div className="border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3 bg-bg-tertiary/50 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary mb-1">{firstLine}</h2>
          {restMessage && (
            <pre className="text-xs text-text-muted mt-2 whitespace-pre-wrap font-mono">{restMessage}</pre>
          )}
        </div>
        <div className="px-4 py-3 bg-bg-primary flex items-center gap-3 flex-wrap">
          {/* Avatar */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: avatarColor(detail.author.name) }}
          >
            {initials}
          </div>
          <div className="text-sm">
            <span className="font-medium text-text-primary">{detail.author.name}</span>
            <span className="text-text-muted"> committed {timeAgo(detail.author.timestamp)}</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">commit</span>
            <code className="text-xs font-mono text-text-secondary bg-bg-tertiary px-2 py-0.5 rounded border border-border">
              {oid.slice(0, 7)}
            </code>
            <button
              onClick={handleCopy}
              className="p-1 text-text-muted hover:text-accent bg-transparent border-0 cursor-pointer rounded hover:bg-bg-tertiary"
              title="Copy full SHA"
            >
              {copiedOid ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-green">
                  <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
                  <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* File changes summary */}
      <div className="flex items-center gap-3 mb-3 text-xs text-text-muted">
        <span>Showing <strong className="text-text-primary">{detail.files.length}</strong> changed files</span>
        {added > 0 && <span className="text-green">+{added} added</span>}
        {modified > 0 && <span className="text-yellow">~{modified} modified</span>}
        {deleted > 0 && <span className="text-red">-{deleted} deleted</span>}
      </div>

      {/* Changed files list */}
      <div className="border border-border rounded-lg overflow-hidden">
        {detail.files.map((file, i) => (
          <div key={file.path}>
            <button
              onClick={() => handleToggleFile(file.path)}
              className={`w-full flex items-center gap-2 px-4 py-2 text-left bg-bg-primary hover:bg-bg-secondary/50 border-0 cursor-pointer ${i > 0 ? "border-t border-border" : ""}`}
            >
              {/* Expand arrow */}
              <svg
                width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
                className={`text-text-muted transition-transform ${expandedFile === file.path ? "rotate-90" : ""}`}
              >
                <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
              </svg>

              {/* Status badge */}
              <span className={`text-[10px] font-bold w-4 text-center ${
                file.type === "add" ? "text-green" : file.type === "delete" ? "text-red" : "text-yellow"
              }`}>
                {file.type === "add" ? "A" : file.type === "delete" ? "D" : "M"}
              </span>

              {/* File path */}
              <span className="text-sm font-mono text-text-primary truncate">{file.path}</span>
            </button>

            {/* Expanded diff */}
            {expandedFile === file.path && (
              <div className="border-t border-border bg-bg-secondary">
                {loadingDiff === file.path ? (
                  <div className="p-4 text-center text-text-muted text-xs">Loading diff...</div>
                ) : diffContent.has(file.path) ? (
                  <div className="overflow-x-auto">
                    <pre className="text-xs font-mono leading-5 m-0">
                      {diffContent.get(file.path)!.map((line, li) => (
                        <div
                          key={li}
                          className={`px-4 ${
                            line.line === "@@"
                              ? "bg-accent/10 text-accent py-1"
                              : line.type === "add"
                                ? "bg-green/10 text-green"
                                : line.type === "del"
                                  ? "bg-red/10 text-red"
                                  : "text-text-muted"
                          }`}
                        >
                          {line.line === "@@" ? "···" : `${line.type === "add" ? "+" : line.type === "del" ? "-" : " "} ${line.line}`}
                        </div>
                      ))}
                    </pre>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
