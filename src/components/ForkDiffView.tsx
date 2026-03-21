import { useState, useEffect } from "react";
import { fetchRepoFiles } from "../lib/nostr";
import type { FileBlobEvent } from "../types/nostr";

interface Props {
  upstreamAddress: string;
  forkAddress: string;
}

interface FileDiff {
  filePath: string;
  status: "added" | "deleted" | "modified" | "unchanged";
  upstreamContent?: string;
  forkContent?: string;
}

function generateDiff(oldContent: string, newContent: string, filename: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  let diff = `--- a/${filename}\n+++ b/${filename}\n`;
  diff += `@@ -1,${oldLines.length} +1,${newLines.length} @@\n`;
  for (const line of oldLines) diff += `-${line}\n`;
  for (const line of newLines) diff += `+${line}\n`;
  return diff;
}

export default function ForkDiffView({ upstreamAddress, forkAddress }: Props) {
  const [diffs, setDiffs] = useState<FileDiff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function compare() {
      setLoading(true);
      setError("");
      try {
        const [upstreamFiles, forkFiles] = await Promise.all([
          fetchRepoFiles(upstreamAddress),
          fetchRepoFiles(forkAddress),
        ]);

        const upstreamMap = new Map<string, FileBlobEvent>();
        for (const f of upstreamFiles) upstreamMap.set(f.filePath, f);

        const forkMap = new Map<string, FileBlobEvent>();
        for (const f of forkFiles) forkMap.set(f.filePath, f);

        const allPaths = new Set([...upstreamMap.keys(), ...forkMap.keys()]);
        const result: FileDiff[] = [];

        for (const path of allPaths) {
          const upstream = upstreamMap.get(path);
          const fork = forkMap.get(path);

          if (fork && !upstream) {
            result.push({ filePath: path, status: "added", forkContent: fork.content });
          } else if (upstream && !fork) {
            result.push({ filePath: path, status: "deleted", upstreamContent: upstream.content });
          } else if (upstream && fork) {
            if (upstream.content !== fork.content) {
              result.push({
                filePath: path,
                status: "modified",
                upstreamContent: upstream.content,
                forkContent: fork.content,
              });
            } else {
              result.push({ filePath: path, status: "unchanged" });
            }
          }
        }

        // Sort: modified first, then added, then deleted, then unchanged
        const order: Record<string, number> = { modified: 0, added: 1, deleted: 2, unchanged: 3 };
        result.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4) || a.filePath.localeCompare(b.filePath));

        if (!cancelled) setDiffs(result);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to compare repositories");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    compare();
    return () => { cancelled = true; };
  }, [upstreamAddress, forkAddress]);

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm">Comparing files with upstream...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red/10 border border-red/30 rounded-lg p-4 text-sm text-red">
        {error}
      </div>
    );
  }

  const changed = diffs.filter((d) => d.status !== "unchanged");
  const added = diffs.filter((d) => d.status === "added");
  const deleted = diffs.filter((d) => d.status === "deleted");
  const modified = diffs.filter((d) => d.status === "modified");

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3 text-sm text-text-secondary bg-bg-tertiary rounded-lg px-4 py-3 border border-border">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-accent">
          <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4Z" />
          <path d="M2.5 2a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5h-11ZM1 2.5A1.5 1.5 0 0 1 2.5 1h11A1.5 1.5 0 0 1 15 2.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 13.5v-11Z" />
        </svg>
        <span>
          <strong>{changed.length}</strong> file{changed.length !== 1 ? "s" : ""} changed
        </span>
        {added.length > 0 && (
          <span className="text-green">{added.length} added</span>
        )}
        {modified.length > 0 && (
          <span className="text-accent">{modified.length} modified</span>
        )}
        {deleted.length > 0 && (
          <span className="text-red">{deleted.length} deleted</span>
        )}
      </div>

      {changed.length === 0 && (
        <div className="text-center py-8 text-text-muted text-sm">
          No differences found between fork and upstream.
        </div>
      )}

      {/* File diffs */}
      {changed.map((diff) => {
        const isExpanded = expandedFiles.has(diff.filePath);
        return (
          <div key={diff.filePath} className="border border-border rounded-lg overflow-hidden">
            {/* File header */}
            <button
              onClick={() => toggleFile(diff.filePath)}
              className="w-full flex items-center gap-2 bg-bg-tertiary px-4 py-2 text-sm font-mono text-text-secondary border-0 cursor-pointer hover:bg-bg-primary transition-colors text-left"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="currentColor"
                className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
              >
                <path d="M4.5 2l4 4-4 4" />
              </svg>
              {diff.status === "added" && (
                <span className="text-green font-semibold">+ {diff.filePath}</span>
              )}
              {diff.status === "deleted" && (
                <span className="text-red font-semibold">- {diff.filePath}</span>
              )}
              {diff.status === "modified" && (
                <span className="text-accent">{diff.filePath}</span>
              )}
              <span className={`ml-auto text-xs px-2 py-0.5 rounded ${
                diff.status === "added"
                  ? "bg-green/15 text-green"
                  : diff.status === "deleted"
                  ? "bg-red/15 text-red"
                  : "bg-accent/15 text-accent"
              }`}>
                {diff.status}
              </span>
            </button>

            {/* Diff content */}
            {isExpanded && (
              <div className="font-mono text-xs overflow-x-auto">
                {diff.status === "modified" && diff.upstreamContent !== undefined && diff.forkContent !== undefined && (
                  (() => {
                    const diffText = generateDiff(diff.upstreamContent, diff.forkContent, diff.filePath);
                    return diffText.split("\n").map((line, i) => {
                      let bg = "";
                      let textColor = "text-text-primary";
                      if (line.startsWith("+") && !line.startsWith("+++")) {
                        bg = "bg-green-subtle";
                        textColor = "text-green";
                      } else if (line.startsWith("-") && !line.startsWith("---")) {
                        bg = "bg-red-subtle";
                        textColor = "text-red";
                      } else if (line.startsWith("@@")) {
                        textColor = "text-accent";
                        bg = "bg-accent/5";
                      } else if (line.startsWith("---") || line.startsWith("+++")) {
                        textColor = "text-text-muted";
                      }
                      return (
                        <div key={i} className={`px-4 py-0 whitespace-pre ${bg} ${textColor}`}>
                          {line}
                        </div>
                      );
                    });
                  })()
                )}
                {diff.status === "added" && diff.forkContent !== undefined && (
                  diff.forkContent.split("\n").map((line, i) => (
                    <div key={i} className="px-4 py-0 whitespace-pre bg-green-subtle text-green">
                      +{line}
                    </div>
                  ))
                )}
                {diff.status === "deleted" && diff.upstreamContent !== undefined && (
                  diff.upstreamContent.split("\n").map((line, i) => (
                    <div key={i} className="px-4 py-0 whitespace-pre bg-red-subtle text-red">
                      -{line}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
