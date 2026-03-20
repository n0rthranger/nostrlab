import { useState, useEffect, useRef } from "react";
import type { FileEntry } from "../types/nostr";

interface Props {
  files: FileEntry[];
  onSelect: (path: string) => void;
  onClose: () => void;
}

function flattenFiles(entries: FileEntry[], prefix = ""): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.type === "file") {
      paths.push(path);
    }
    if (entry.children) {
      paths.push(...flattenFiles(entry.children, path));
    }
  }
  return paths;
}

function fuzzyMatch(path: string, query: string): { match: boolean; score: number } {
  const lowerPath = path.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Exact substring match gets high score
  if (lowerPath.includes(lowerQuery)) {
    return { match: true, score: 100 - lowerPath.indexOf(lowerQuery) };
  }

  // Fuzzy match: all query chars appear in order
  let qi = 0;
  for (let pi = 0; pi < lowerPath.length && qi < lowerQuery.length; pi++) {
    if (lowerPath[pi] === lowerQuery[qi]) qi++;
  }

  if (qi === lowerQuery.length) {
    return { match: true, score: 50 };
  }

  return { match: false, score: 0 };
}

export default function FileSearch({ files, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const allPaths = flattenFiles(files);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = query
    ? allPaths
        .map((path) => ({ path, ...fuzzyMatch(path, query) }))
        .filter((r) => r.match)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
    : allPaths.slice(0, 20).map((path) => ({ path, match: true, score: 0 }));

  // selectedIndex resets are handled in the onChange handler below

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      onSelect(results[selectedIndex].path);
      onClose();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] bg-black/60 file-search-overlay" onClick={onClose}>
      <div className="bg-bg-secondary border border-border rounded-xl w-full max-w-lg mx-4 overflow-hidden animate-fadeIn shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted shrink-0">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search files..."
            className="flex-1 bg-transparent border-0 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <kbd className="px-1.5 py-0.5 bg-bg-tertiary border border-border rounded text-[10px] font-mono text-text-muted">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-text-muted text-sm">No files found</div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.path}
                onClick={() => { onSelect(r.path); onClose(); }}
                className={`w-full text-left px-4 py-2 text-sm font-mono cursor-pointer bg-transparent border-0 flex items-center gap-2 ${
                  i === selectedIndex ? "bg-accent/10 text-accent" : "text-text-primary hover:bg-bg-tertiary"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-text-muted">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <span className="truncate">{r.path}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
