import { useState } from "react";
import type { FileEntry } from "../types/nostr";

interface Props {
  entries: FileEntry[];
  selectedPath?: string;
  onSelect: (path: string) => void;
  depth?: number;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={`text-text-muted shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
    >
      <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-accent shrink-0">
      <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted shrink-0">
      <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z" />
    </svg>
  );
}

export default function FileTree({ entries, selectedPath, onSelect, depth = 0 }: Props) {
  return (
    <div className={depth === 0 ? "text-sm" : ""}>
      {entries.map((entry) => (
        <FileTreeItem
          key={entry.path}
          entry={entry}
          selectedPath={selectedPath}
          onSelect={onSelect}
          depth={depth}
        />
      ))}
    </div>
  );
}

function FileTreeItem({
  entry,
  selectedPath,
  onSelect,
  depth,
}: {
  entry: FileEntry;
  selectedPath?: string;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isSelected = selectedPath === entry.path;
  const paddingLeft = `${depth * 16 + 8}px`;

  if (entry.type === "dir") {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left flex items-center gap-1.5 py-1.5 px-2 hover:bg-bg-tertiary cursor-pointer bg-transparent text-text-primary border-0 text-sm"
          style={{ paddingLeft }}
        >
          <ChevronIcon expanded={expanded} />
          <FolderIcon />
          <span>{entry.name}</span>
        </button>
        {expanded && entry.children && (
          <FileTree
            entries={entry.children}
            selectedPath={selectedPath}
            onSelect={onSelect}
            depth={depth + 1}
          />
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(entry.path)}
      className={`w-full text-left flex items-center gap-1.5 py-1.5 px-2 cursor-pointer bg-transparent border-0 text-sm ${
        isSelected ? "bg-accent/15 text-accent" : "hover:bg-bg-tertiary text-text-primary"
      }`}
      style={{ paddingLeft: `${depth * 16 + 22}px` }}
    >
      <FileIcon />
      <span>{entry.name}</span>
    </button>
  );
}
