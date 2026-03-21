import { useState, useEffect } from "react";
import { gitLog, type CommitInfo } from "../lib/git";
import { timeAgo } from "../lib/nostr";
import CommitDetail from "./CommitDetail";

interface Props {
  repoDir: string;
  onSelectCommit?: (oid: string) => void;
}

/** Group commits by date label (e.g. "Mar 21, 2026") */
function groupByDate(commits: CommitInfo[]): Map<string, CommitInfo[]> {
  const groups = new Map<string, CommitInfo[]>();
  for (const c of commits) {
    const date = new Date(c.author.timestamp * 1000);
    const label = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const existing = groups.get(label);
    if (existing) {
      existing.push(c);
    } else {
      groups.set(label, [c]);
    }
  }
  return groups;
}

/** Generate a simple avatar color from a name */
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 50%, 40%)`;
}

export default function CommitHistory({ repoDir, onSelectCommit }: Props) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCount, setShowCount] = useState(20);
  const [copiedOid, setCopiedOid] = useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    gitLog(repoDir, 100).then((c) => {
      if (cancelled) return;
      setCommits(c);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [repoDir]);

  const handleSelectCommit = (oid: string) => {
    if (onSelectCommit) {
      onSelectCommit(oid);
    }
    setSelectedCommit(oid);
  };

  const handleCopySha = (oid: string) => {
    navigator.clipboard.writeText(oid).then(() => {
      setCopiedOid(oid);
      setTimeout(() => setCopiedOid(null), 2000);
    });
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">
        <div className="inline-block w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mb-2" />
        <p>Loading commit history...</p>
      </div>
    );
  }

  if (commits.length === 0) {
    return <div className="text-center py-8 text-text-muted text-sm">No commits found</div>;
  }

  // Show commit detail view
  if (selectedCommit) {
    return (
      <CommitDetail
        repoDir={repoDir}
        oid={selectedCommit}
        onBack={() => setSelectedCommit(null)}
      />
    );
  }

  const visible = commits.slice(0, showCount);
  const grouped = groupByDate(visible);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted">
          <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z" />
        </svg>
        <h3 className="text-sm font-medium text-text-primary">{commits.length} Commits</h3>
      </div>

      {/* Grouped commit list */}
      {Array.from(grouped.entries()).map(([dateLabel, group]) => (
        <div key={dateLabel} className="mb-4">
          {/* Date header */}
          <div className="flex items-center gap-2 py-2 px-4 text-xs font-medium text-text-secondary bg-bg-tertiary/50 border border-border rounded-t-lg">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted">
              <path d="M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2.5 7.5v6.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V7.5Zm10.75-4H2.75a.25.25 0 0 0-.25.25V6h11V3.75a.25.25 0 0 0-.25-.25Z" />
            </svg>
            Commits on {dateLabel}
          </div>

          {/* Commits in this date group */}
          <div className="border border-t-0 border-border rounded-b-lg overflow-hidden">
            {group.map((commit, i) => {
              const firstLine = commit.message.split("\n")[0];
              const initials = commit.author.name
                .split(/\s+/)
                .map((w) => w[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);

              return (
                <div
                  key={commit.oid}
                  className={`flex items-center gap-3 px-4 py-3 bg-bg-primary hover:bg-bg-secondary/50 ${i > 0 ? "border-t border-border" : ""}`}
                >
                  {/* Avatar */}
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: avatarColor(commit.author.name) }}
                    title={commit.author.name}
                  >
                    {initials}
                  </div>

                  {/* Message + author */}
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => handleSelectCommit(commit.oid)}
                      className="text-sm text-text-primary font-medium hover:text-accent truncate block text-left bg-transparent border-0 cursor-pointer p-0 w-full"
                    >
                      {firstLine}
                    </button>
                    <div className="text-xs text-text-muted mt-0.5">
                      <span className="font-medium text-text-secondary">{commit.author.name}</span>
                      {" "}committed {timeAgo(commit.author.timestamp)}
                    </div>
                  </div>

                  {/* Actions: copy SHA + short hash */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCopySha(commit.oid)}
                      className="p-1 text-text-muted hover:text-accent bg-transparent border-0 cursor-pointer rounded hover:bg-bg-tertiary"
                      title="Copy full SHA"
                    >
                      {copiedOid === commit.oid ? (
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
                    <code className="text-xs font-mono text-accent bg-bg-tertiary px-2 py-0.5 rounded border border-border hover:bg-accent/10 cursor-pointer"
                      onClick={() => handleSelectCommit(commit.oid)}
                      title={commit.oid}
                    >
                      {commit.oid.slice(0, 7)}
                    </code>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Show more */}
      {showCount < commits.length && (
        <div className="text-center py-3">
          <button
            onClick={() => setShowCount((c) => c + 30)}
            className="text-sm text-accent hover:underline bg-transparent border-0 cursor-pointer"
          >
            Show older commits
          </button>
        </div>
      )}
    </div>
  );
}
