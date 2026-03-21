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
  return `hsl(${Math.abs(hash) % 360}, 50%, 40%)`;
}

export default function CommitHistory({ repoDir, onSelectCommit }: Props) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCount, setShowCount] = useState(20);
  const [copiedOid, setCopiedOid] = useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [expandedDescs, setExpandedDescs] = useState<Set<string>>(new Set());

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
    if (onSelectCommit) onSelectCommit(oid);
    setSelectedCommit(oid);
  };

  const handleCopySha = (oid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(oid).then(() => {
      setCopiedOid(oid);
      setTimeout(() => setCopiedOid(null), 2000);
    });
  };

  const toggleDesc = (oid: string) => {
    setExpandedDescs((prev) => {
      const next = new Set(prev);
      if (next.has(oid)) next.delete(oid);
      else next.add(oid);
      return next;
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
      {Array.from(grouped.entries()).map(([dateLabel, group]) => (
        <div key={dateLabel} className="mb-6">
          {/* Date header */}
          <h3 className="text-sm font-semibold text-text-secondary mb-2 pl-6">
            Commits on {dateLabel}
          </h3>

          {/* Timeline + commits */}
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[15px] top-0 bottom-0 w-[2px] bg-border" />

            {group.map((commit) => {
              const firstLine = commit.message.split("\n")[0];
              const restMessage = commit.message.slice(firstLine.length).trim();
              const hasDesc = restMessage.length > 0;
              const isExpanded = expandedDescs.has(commit.oid);
              const initials = commit.author.name
                .split(/\s+/)
                .map((w) => w[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);

              return (
                <div key={commit.oid} className="relative flex gap-3 pb-0">
                  {/* Timeline dot */}
                  <div className="relative z-10 shrink-0 w-8 flex justify-center pt-4">
                    <div className="w-4 h-4 rounded-full bg-bg-primary border-2 border-border flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-text-muted" />
                    </div>
                  </div>

                  {/* Commit card */}
                  <div className="flex-1 border border-border rounded-lg mb-3 overflow-hidden bg-bg-primary">
                    <div className="flex items-start gap-3 px-4 py-3">
                      {/* Left: message area */}
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => handleSelectCommit(commit.oid)}
                          className="text-sm text-text-primary font-semibold hover:text-accent text-left bg-transparent border-0 cursor-pointer p-0 leading-snug"
                        >
                          {firstLine}
                        </button>

                        {hasDesc && (
                          <button
                            onClick={() => toggleDesc(commit.oid)}
                            className="block mt-1 text-xs text-text-muted hover:text-accent bg-transparent border-0 cursor-pointer p-0"
                          >
                            {isExpanded ? "Hide description" : `Show description`}
                          </button>
                        )}

                        {isExpanded && restMessage && (
                          <pre className="mt-2 text-xs text-text-secondary whitespace-pre-wrap font-mono bg-bg-tertiary/50 rounded px-3 py-2 border border-border">
                            {restMessage}
                          </pre>
                        )}
                      </div>

                      {/* Right: SHA + actions */}
                      <div className="flex items-center gap-1 shrink-0 pt-0.5">
                        {/* Copy SHA */}
                        <button
                          onClick={(e) => handleCopySha(commit.oid, e)}
                          className="p-1.5 text-text-muted hover:text-accent bg-transparent border border-border rounded cursor-pointer hover:bg-bg-tertiary"
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

                        {/* Short SHA link */}
                        <button
                          onClick={() => handleSelectCommit(commit.oid)}
                          className="font-mono text-xs text-accent px-2 py-1 border border-border rounded cursor-pointer bg-transparent hover:bg-accent/10"
                          title={commit.oid}
                        >
                          {commit.oid.slice(0, 7)}
                        </button>

                        {/* Browse code at this commit */}
                        <button
                          onClick={() => handleSelectCommit(commit.oid)}
                          className="p-1.5 text-text-muted hover:text-accent bg-transparent border border-border rounded cursor-pointer hover:bg-bg-tertiary"
                          title="Browse the repository at this point in the history"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Author bar */}
                    <div className="flex items-center gap-2 px-4 py-2 bg-bg-secondary/30 border-t border-border">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0"
                        style={{ backgroundColor: avatarColor(commit.author.name) }}
                      >
                        {initials}
                      </div>
                      <span className="text-xs font-medium text-text-primary">{commit.author.name}</span>
                      <span className="text-xs text-text-muted">committed {timeAgo(commit.author.timestamp)}</span>
                    </div>
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
