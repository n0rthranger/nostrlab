import { useState, useEffect } from "react";
import { gitLog, type CommitInfo } from "../lib/git";
import { timeAgo } from "../lib/nostr";

interface Props {
  repoDir: string;
  onSelectCommit?: (oid: string) => void;
}

export default function CommitHistory({ repoDir, onSelectCommit }: Props) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCount, setShowCount] = useState(20);

  useEffect(() => {
    let cancelled = false;
    gitLog(repoDir, 100).then((c) => {
      if (cancelled) return;
      setCommits(c);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [repoDir]);

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

  const visible = commits.slice(0, showCount);

  return (
    <div className="Box">
      <div className="Box-header py-2 px-4">
        <h3 className="text-sm font-medium">{commits.length} commits</h3>
      </div>
      {visible.map((commit) => {
        const firstLine = commit.message.split("\n")[0];
        return (
          <div key={commit.oid} className="Box-row flex items-start gap-3">
            <div className="shrink-0 mt-1">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted">
                <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <button
                onClick={() => onSelectCommit?.(commit.oid)}
                className="text-sm text-text-primary font-medium hover:text-accent truncate block text-left bg-transparent border-0 cursor-pointer p-0 w-full"
              >
                {firstLine}
              </button>
              <div className="text-xs text-text-muted mt-0.5">
                <span className="font-medium text-text-secondary">{commit.author.name}</span>
                {" "}committed {timeAgo(commit.author.timestamp)}
              </div>
            </div>
            <code className="text-xs font-mono text-text-muted bg-bg-tertiary px-2 py-0.5 rounded shrink-0">
              {commit.oid.slice(0, 7)}
            </code>
          </div>
        );
      })}
      {showCount < commits.length && (
        <div className="p-3 text-center">
          <button
            onClick={() => setShowCount((c) => c + 30)}
            className="text-sm text-accent hover:underline bg-transparent border-0 cursor-pointer"
          >
            Show more commits
          </button>
        </div>
      )}
    </div>
  );
}
