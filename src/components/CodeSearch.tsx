import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { readFile } from "../lib/git";
import type { FileEntry } from "../types/nostr";

interface Props {
  repoDir: string;
  files: FileEntry[];
  onResultClick: (path: string) => void;
}

interface SearchResult {
  path: string;
  line: number;
  content: string;
}

function flattenFiles(entries: FileEntry[]): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.type === "file") {
      paths.push(entry.path);
    } else if (entry.children) {
      paths.push(...flattenFiles(entry.children));
    }
  }
  return paths;
}

export default function CodeSearch({ repoDir, files, onResultClick }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  const allFiles = useMemo(() => flattenFiles(files), [files]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    const found: SearchResult[] = [];
    const lower = q.toLowerCase();

    // Search through files (limit to text files, skip binary)
    const binaryExts = new Set(["png", "jpg", "jpeg", "gif", "ico", "woff", "woff2", "ttf", "zip", "gz", "tar", "pdf", "exe", "wasm"]);

    for (const path of allFiles) {
      if (found.length >= 50) break;
      const ext = path.split(".").pop()?.toLowerCase();
      if (ext && binaryExts.has(ext)) continue;

      try {
        const content = await readFile(repoDir, path);
        if (!content) continue;

        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (found.length >= 50) break;
          if (lines[i].toLowerCase().includes(lower)) {
            found.push({
              path,
              line: i + 1,
              content: lines[i].trim().slice(0, 120),
            });
          }
        }
      } catch {
        // skip unreadable files
      }
    }

    setResults(found);
    setSelectedIndex(0);
    setSearching(false);
  }, [repoDir, allFiles]);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => doSearch(query), 300);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [query, doSearch]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      onResultClick(results[selectedIndex].path);
    }
  };

  return (
    <div>
      <div className="relative mb-3">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search in repository code..."
          className="w-full bg-bg-primary border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {query.length >= 2 && !searching && results.length === 0 && (
        <p className="text-sm text-text-muted text-center py-4">No results found for "{query}"</p>
      )}

      {results.length > 0 && (
        <div className="Box max-h-80 overflow-y-auto">
          <div className="Box-header py-1.5 px-4">
            <span className="text-xs text-text-muted">{results.length} result{results.length !== 1 ? "s" : ""}</span>
          </div>
          {results.map((result, i) => (
            <button
              key={`${result.path}:${result.line}`}
              onClick={() => onResultClick(result.path)}
              className={`w-full text-left px-4 py-2 text-sm border-0 cursor-pointer flex items-start gap-3 ${
                i === selectedIndex ? "bg-accent/10" : "bg-transparent hover:bg-bg-tertiary"
              }`}
            >
              <span className="text-accent text-xs font-mono shrink-0 mt-0.5">{result.path}:{result.line}</span>
              <span className="text-text-secondary text-xs font-mono truncate">{result.content}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
