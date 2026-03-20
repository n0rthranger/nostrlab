import { useState, useEffect, useCallback, useMemo } from "react";
import type { Event } from "nostr-tools";
import {
  fetchRepoFiles,
  buildFileTree,
  publishFileBlob,
  deleteFileBlob,
  fetchFileHistory,
  fetchRepoBranches,
  timeAgo,
  DEFAULT_RELAYS,
} from "../lib/nostr";
import type { FileBlobEvent } from "../types/nostr";
import { REPO_FILE_BLOB } from "../types/nostr";
import { useLiveEvents } from "../hooks/useSubscription";
import FileTree from "./FileTree";
import FileViewer from "./FileViewer";
import MarkdownContent from "./MarkdownContent";
import { useAuth } from "../hooks/useAuth";
import { isBinaryFile } from "../lib/git";
import { downloadRepoZip } from "../lib/zip";
import { triggerMatchingWebhooks } from "../lib/webhooks";
import { encryptContent, decryptContent } from "../lib/crypto";

// ── Constants ──

const MAX_FILE_SIZE = 100_000; // 100KB

const MIME_TYPES: Record<string, string> = {
  ts: "text/typescript", tsx: "text/typescript", js: "text/javascript", jsx: "text/javascript",
  py: "text/x-python", rs: "text/x-rust", go: "text/x-go", rb: "text/x-ruby",
  java: "text/x-java", c: "text/x-c", cpp: "text/x-c++", h: "text/x-c",
  html: "text/html", css: "text/css", json: "application/json",
  md: "text/markdown", yaml: "text/yaml", yml: "text/yaml", toml: "text/toml",
  sh: "text/x-shellscript", xml: "text/xml", sql: "text/x-sql",
};

function detectMimeType(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext ? MIME_TYPES[ext] : undefined;
}

/** Returns true if the string matches the AES-GCM encrypted format: 24-hex-iv:hex-ciphertext */
function looksEncrypted(content: string): boolean {
  return /^[0-9a-f]{24}:[0-9a-f]+$/i.test(content);
}

// ── Types ──

interface Props {
  repoAddress: string;
  repoPubkey: string;
}

interface FileDisplayInfo {
  content: string;
  isEncrypted: boolean;
  isDecrypted: boolean;
}

// ── Sub-components ──

function LoadingSpinner() {
  return (
    <div className="text-center py-12 text-text-secondary">
      <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-sm">Loading files...</p>
    </div>
  );
}

function EmptyRepoState({ isMaintainer, onCreateFile, onUploadFiles }: {
  isMaintainer: boolean;
  onCreateFile: () => void;
  onUploadFiles: (files: FileList) => void;
}) {
  return (
    <div className="border border-border rounded-xl p-8 bg-bg-secondary text-center">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 text-text-muted">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <p className="text-text-secondary mb-4">No files uploaded yet</p>
      {isMaintainer && (
        <div className="space-y-3">
          <button onClick={onCreateFile} className="px-6 py-2.5 bg-green text-white rounded-lg font-medium hover:brightness-110 cursor-pointer">
            Create a file
          </button>
          <p className="text-xs text-text-muted">or</p>
          <label className="inline-block px-6 py-2.5 bg-accent/15 text-accent rounded-lg font-medium hover:bg-accent/25 cursor-pointer">
            Upload files
            <input type="file" multiple className="hidden" onChange={(e) => e.target.files && onUploadFiles(e.target.files)} />
          </label>
        </div>
      )}
    </div>
  );
}

function FileEditor({ editPath, editContent, isEditing, isSaving, error, onPathChange, onContentChange, onSave, onCancel }: {
  editPath: string;
  editContent: string;
  isEditing: boolean;
  isSaving: boolean;
  error: string;
  onPathChange: (path: string) => void;
  onContentChange: (content: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-bg-secondary">
      <div className="bg-bg-tertiary px-4 py-2 border-b border-border flex items-center gap-2">
        <span className="text-sm font-medium">{isEditing ? "Edit file" : "Create new file"}</span>
      </div>
      <div className="p-4 space-y-3">
        {error && (
          <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-sm text-red">{error}</div>
        )}
        <div>
          <label className="text-xs text-text-secondary block mb-1">File path</label>
          <input
            type="text"
            value={editPath}
            onChange={(e) => onPathChange(e.target.value)}
            placeholder="src/main.ts"
            disabled={isEditing}
            className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent disabled:opacity-50"
          />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">
            Content
            <span className="ml-2 text-text-muted">
              {editContent.length > 0 ? `${Math.round(editContent.length / 1000)}KB / ${MAX_FILE_SIZE / 1000}KB` : ""}
            </span>
          </label>
          <textarea
            value={editContent}
            onChange={(e) => onContentChange(e.target.value)}
            placeholder="File content..."
            className="w-full h-96 bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary resize-y placeholder:text-text-muted focus:outline-none focus:border-accent"
            spellCheck={false}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSave}
            disabled={isSaving || !editPath.trim()}
            className="px-4 py-2 bg-green text-white rounded-lg text-sm font-medium hover:brightness-110 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? "Saving..." : "Save file"}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-border text-text-secondary rounded-lg text-sm cursor-pointer bg-transparent hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function BranchSelector({ branches, activeBranch, isOpen, onToggle, onSelect }: {
  branches: string[];
  activeBranch: string;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (branch: string) => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-bg-tertiary border border-border rounded-lg hover:border-text-muted cursor-pointer text-text-primary"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
          <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
        </svg>
        <span className="font-mono">{activeBranch}</span>
        <span className="text-text-muted text-xs">&#9660;</span>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-bg-secondary border border-border rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
          <div className="px-3 py-1.5 text-xs text-text-muted font-medium border-b border-border">Branches</div>
          {branches.map((branch) => (
            <button
              key={branch}
              onClick={() => onSelect(branch)}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-bg-tertiary cursor-pointer bg-transparent border-0 ${
                branch === activeBranch ? "text-accent font-medium" : "text-text-primary"
              }`}
            >
              {branch}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EncryptionKeyPrompt({ keyInput, decryptError, onKeyChange, onSubmit }: {
  keyInput: string;
  decryptError: string | null;
  onKeyChange: (key: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="p-8 text-center">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 text-text-muted">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <p className="text-text-secondary mb-1 font-medium">This file is encrypted</p>
      <p className="text-xs text-text-muted mb-4">Enter the repository decryption key to view its contents.</p>
      {decryptError && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-2 text-sm text-red mb-3 inline-block">{decryptError}</div>
      )}
      <div className="flex gap-2 max-w-md mx-auto">
        <input
          type="text"
          value={keyInput}
          onChange={(e) => onKeyChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder="Paste decryption key..."
          className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:brightness-110 cursor-pointer">
          Unlock
        </button>
      </div>
    </div>
  );
}

function VersionHistoryPanel({ fileHistory, historyLoading, viewingVersion, onSelectVersion }: {
  fileHistory: FileBlobEvent[];
  historyLoading: boolean;
  viewingVersion: FileBlobEvent | null;
  onSelectVersion: (version: FileBlobEvent | null) => void;
}) {
  return (
    <div className="border-b border-border bg-bg-primary px-4 py-3">
      <div className="text-xs font-medium text-text-secondary mb-2">Version History</div>
      {historyLoading ? (
        <div className="flex items-center gap-2 text-xs text-text-muted py-2">
          <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
          Loading history...
        </div>
      ) : fileHistory.length === 0 ? (
        <div className="text-xs text-text-muted py-1">No history found</div>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {fileHistory.map((version, idx) => (
            <button
              key={version.id}
              onClick={() => onSelectVersion(idx === 0 ? null : version)}
              className={`w-full text-left px-3 py-1.5 rounded text-xs cursor-pointer bg-transparent border-0 flex items-center gap-2 ${
                (idx === 0 && !viewingVersion) || viewingVersion?.id === version.id
                  ? "bg-accent/10 text-accent"
                  : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
              }`}
            >
              <span className="font-mono">{timeAgo(version.createdAt)}</span>
              {idx === 0 && (
                <span className="text-[10px] px-1.5 py-0.5 bg-green/15 text-green rounded">latest</span>
              )}
              <span className="text-text-muted ml-auto font-mono text-[10px]">{version.id.slice(0, 8)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FileContentView({ displayInfo, filePath }: {
  displayInfo: FileDisplayInfo;
  filePath: string;
}) {
  const isMarkdown = filePath.toLowerCase().endsWith(".md");

  if (isMarkdown) {
    return (
      <div className="p-6">
        <div className="bg-bg-tertiary px-4 py-2 text-sm text-text-secondary border-b border-border rounded-t-lg font-mono flex items-center gap-2">
          {filePath}
          {displayInfo.isDecrypted && (
            <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/15 text-yellow-500 rounded ml-auto">decrypted</span>
          )}
        </div>
        <div className="border border-border border-t-0 rounded-b-lg p-4 bg-bg-primary">
          <MarkdownContent content={displayInfo.content} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {displayInfo.isDecrypted && (
        <div className="px-4 py-1 bg-yellow-500/10 border-b border-yellow-500/20 text-xs text-yellow-500 flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Decrypted content
        </div>
      )}
      <FileViewer content={displayInfo.content} filename={filePath} />
    </div>
  );
}

function ReadmeView({ content }: { content: string }) {
  return (
    <div className="p-6">
      <div className="bg-bg-tertiary px-4 py-2 text-sm text-text-secondary border border-border rounded-t-lg font-mono flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        README.md
      </div>
      <div className="border border-border border-t-0 rounded-b-lg p-6 bg-bg-primary">
        <MarkdownContent content={content} />
      </div>
    </div>
  );
}

// ── Hooks ──

/** Manages the decryption key for an encrypted repo and a cache of decrypted file contents. */
function useEncryption(repoAddress: string) {
  const [repoKey, setRepoKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [decryptedCache, setDecryptedCache] = useState<Map<string, string>>(new Map());
  const [decryptError, setDecryptError] = useState<string | null>(null);

  // Load encryption key from localStorage on mount
  useEffect(() => {
    const storedKey = localStorage.getItem(`nostr-repo-key:${repoAddress}`);
    if (storedKey) queueMicrotask(() => setRepoKey(storedKey));
  }, [repoAddress]);

  const submitKey = useCallback(() => {
    if (!keyInput.trim()) return;
    const key = keyInput.trim();
    setRepoKey(key);
    localStorage.setItem(`nostr-repo-key:${repoAddress}`, key);
    setKeyInput("");
    setDecryptedCache(new Map());
    setDecryptError(null);
  }, [keyInput, repoAddress]);

  const tryDecryptFile = useCallback(async (fileId: string, content: string, key: string): Promise<string | null> => {
    try {
      const decryptedContent = await decryptContent(content, key);
      setDecryptedCache((prev) => new Map(prev).set(fileId, decryptedContent));
      setDecryptError(null);
      return decryptedContent;
    } catch {
      setDecryptError("Decryption failed. Wrong key?");
      return null;
    }
  }, []);

  const getDisplayInfo = useCallback((file: FileBlobEvent): FileDisplayInfo => {
    if (!looksEncrypted(file.content)) {
      return { content: file.content, isEncrypted: false, isDecrypted: false };
    }
    const cached = decryptedCache.get(file.id);
    if (cached !== undefined) {
      return { content: cached, isEncrypted: true, isDecrypted: true };
    }
    return { content: file.content, isEncrypted: true, isDecrypted: false };
  }, [decryptedCache]);

  return { repoKey, keyInput, setKeyInput, decryptError, submitKey, tryDecryptFile, getDisplayInfo, decryptedCache };
}

/** Merges initial fetched files with real-time updates from relay subscriptions. */
function useLiveFileSync(repoAddress: string, fetchedFiles: FileBlobEvent[]) {
  const [sinceTs] = useState(() => Math.floor(Date.now() / 1000));

  const parseLiveFile = useCallback((event: Event): FileBlobEvent | null => {
    const addr = event.tags.find((tag: string[]) => tag[0] === "a")?.[1];
    if (addr !== repoAddress) return null;
    const filePath = event.tags.find((tag: string[]) => tag[0] === "path")?.[1];
    if (!filePath) return null;
    return {
      id: event.id,
      pubkey: event.pubkey,
      content: event.content,
      repoAddress: addr,
      filePath,
      mimeType: event.tags.find((tag: string[]) => tag[0] === "m")?.[1],
      isDeleted: event.tags.some((tag: string[]) => tag[0] === "deleted" && tag[1] === "true"),
      createdAt: event.created_at,
    };
  }, [repoAddress]);

  const { events: liveFiles } = useLiveEvents(
    DEFAULT_RELAYS,
    [{ kinds: [REPO_FILE_BLOB], "#a": [repoAddress], since: sinceTs }],
    parseLiveFile,
    { enabled: true },
  );

  // Merge fetched + live files, preferring newer versions, removing deleted
  const mergedFiles = useMemo(() => {
    const byPath = new Map<string, FileBlobEvent>();
    for (const file of fetchedFiles) byPath.set(file.filePath, file);
    for (const liveFile of liveFiles) {
      const existing = byPath.get(liveFile.filePath);
      if (!existing || liveFile.createdAt > existing.createdAt) {
        if (liveFile.isDeleted) byPath.delete(liveFile.filePath);
        else byPath.set(liveFile.filePath, liveFile);
      }
    }
    return [...byPath.values()];
  }, [fetchedFiles, liveFiles]);

  const hasLiveUpdates = liveFiles.length > 0;

  return { mergedFiles, hasLiveUpdates };
}

// ── Main Component ──

export default function NostrCodeBrowser({ repoAddress, repoPubkey }: Props) {
  const { pubkey, signer } = useAuth();

  // File data
  const [files, setFiles] = useState<FileBlobEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Navigation
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [branches, setBranches] = useState<string[]>(["main"]);
  const [activeBranch, setActiveBranch] = useState("main");
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);

  // Editor
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editPath, setEditPath] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // File history
  const [showHistory, setShowHistory] = useState(false);
  const [fileHistory, setFileHistory] = useState<FileBlobEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<FileBlobEvent | null>(null);

  // Encryption & live sync
  const encryption = useEncryption(repoAddress);
  const { mergedFiles: allFiles, hasLiveUpdates } = useLiveFileSync(repoAddress, files);
  const allTree = useMemo(() => buildFileTree(allFiles), [allFiles]);

  const isMaintainer = pubkey === repoPubkey;

  // Auto-decrypt selected file when key is available
  useEffect(() => {
    if (!selectedPath || !encryption.repoKey) return;
    const file = allFiles.find((f) => f.filePath === selectedPath);
    if (!file || !looksEncrypted(file.content) || encryption.decryptedCache.has(file.id)) return;
    encryption.tryDecryptFile(file.id, file.content, encryption.repoKey);
  }, [selectedPath, encryption.repoKey, allFiles, encryption.decryptedCache, encryption.tryDecryptFile]);

  // Derive readme content from files (includes live updates)
  const readmeContent = useMemo(() => {
    const readme = allFiles.find((f) => /^readme\.md$/i.test(f.filePath));
    return readme?.content ?? null;
  }, [allFiles]);

  const selectedFile = viewingVersion ?? (selectedPath ? allFiles.find((f) => f.filePath === selectedPath) : null) ?? null;

  // ── Data Loading ──

  const loadFiles = async (branch?: string) => {
    try {
      const fetched = await fetchRepoFiles(repoAddress, undefined, branch ?? activeBranch);
      setFiles(fetched);
    } catch {
      // File loading failures are non-fatal; UI shows empty state
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchRepoFiles(repoAddress, undefined, activeBranch),
      fetchRepoBranches(repoAddress),
    ]).then(([fetched, fetchedBranches]) => {
      if (cancelled) return;
      setFiles(fetched);
      setBranches(fetchedBranches);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [repoAddress]);

  // ── Event Handlers ──

  const resetEditorState = () => {
    setEditing(false);
    setCreating(false);
    setError("");
  };

  const handleSelectFile = (path: string) => {
    setSelectedPath(path);
    resetEditorState();
    setShowHistory(false);
    setViewingVersion(null);
    setFileHistory([]);
  };

  const handleBranchChange = async (branch: string) => {
    setBranchMenuOpen(false);
    if (branch === activeBranch) return;
    setActiveBranch(branch);
    setSelectedPath(undefined);
    setViewingVersion(null);
    setShowHistory(false);
    setFileHistory([]);
    await loadFiles(branch);
  };

  const handleShowHistory = async () => {
    if (!selectedPath) return;
    if (showHistory) {
      setShowHistory(false);
      setViewingVersion(null);
      return;
    }
    setHistoryLoading(true);
    setShowHistory(true);
    try {
      const history = await fetchFileHistory(repoAddress, selectedPath);
      setFileHistory(history);
    } catch {
      setFileHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleStartCreate = () => {
    setCreating(true);
    setEditing(false);
    setEditPath("");
    setEditContent("");
    setError("");
  };

  const handleStartEdit = () => {
    if (!selectedFile) return;
    setEditing(true);
    setCreating(false);
    setEditPath(selectedFile.filePath);
    setEditContent(encryption.getDisplayInfo(selectedFile).content);
    setError("");
  };

  const handleSave = async () => {
    if (!signer || !editPath.trim()) return;

    const normalizedPath = editPath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalizedPath.includes("..") || !normalizedPath) {
      setError("Invalid file path");
      return;
    }
    if (editContent.length > MAX_FILE_SIZE) {
      setError(`File too large (${Math.round(editContent.length / 1000)}KB). Max ${MAX_FILE_SIZE / 1000}KB.`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const contentToPublish = encryption.repoKey
        ? await encryptContent(editContent, encryption.repoKey)
        : editContent;

      await publishFileBlob(signer, {
        repoAddress,
        repoPubkey,
        filePath: normalizedPath,
        content: contentToPublish,
        mimeType: detectMimeType(normalizedPath),
        branch: activeBranch !== "main" ? activeBranch : undefined,
      });

      triggerMatchingWebhooks(repoAddress, "file_push", {
        action: editing ? "updated" : "created",
        filePath: normalizedPath,
        author: pubkey,
      });

      resetEditorState();
      setSelectedPath(normalizedPath);
      await loadFiles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save file");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!signer || !selectedPath) return;
    if (!confirm(`Delete ${selectedPath}?`)) return;

    setSaving(true);
    setError("");
    try {
      await deleteFileBlob(signer, { repoAddress, filePath: selectedPath, pubkey: pubkey! });
      triggerMatchingWebhooks(repoAddress, "file_push", {
        action: "deleted",
        filePath: selectedPath,
        author: pubkey,
      });
      setSelectedPath(undefined);
      await loadFiles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete file");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadFiles = async (fileList: FileList) => {
    if (!signer) return;
    setError("");
    setSaving(true);
    let uploadedCount = 0;
    try {
      for (const file of Array.from(fileList)) {
        if (isBinaryFile(file.name) || file.size > MAX_FILE_SIZE) continue;
        const content = await file.text();
        await publishFileBlob(signer, {
          repoAddress,
          repoPubkey,
          filePath: file.webkitRelativePath || file.name,
          content,
          mimeType: detectMimeType(file.name),
          branch: activeBranch !== "main" ? activeBranch : undefined,
        });
        uploadedCount++;
      }
      if (uploadedCount > 0) await loadFiles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──

  if (loading) return <LoadingSpinner />;

  if (allFiles.length === 0 && !creating) {
    return <EmptyRepoState isMaintainer={isMaintainer} onCreateFile={handleStartCreate} onUploadFiles={handleUploadFiles} />;
  }

  if (creating || editing) {
    return (
      <FileEditor
        editPath={editPath}
        editContent={editContent}
        isEditing={editing}
        isSaving={saving}
        error={error}
        onPathChange={setEditPath}
        onContentChange={setEditContent}
        onSave={handleSave}
        onCancel={resetEditorState}
      />
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3">
        <BranchSelector
          branches={branches}
          activeBranch={activeBranch}
          isOpen={branchMenuOpen}
          onToggle={() => setBranchMenuOpen(!branchMenuOpen)}
          onSelect={handleBranchChange}
        />

        <span className="text-xs text-text-muted">{allFiles.length} file{allFiles.length !== 1 ? "s" : ""}</span>

        {encryption.repoKey && (
          <span className="flex items-center gap-1 text-xs text-yellow-500" title="Private repo — encryption key loaded">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Encrypted
          </span>
        )}

        {hasLiveUpdates && (
          <span className="flex items-center gap-1 text-xs text-green">
            <span className="inline-block w-2 h-2 rounded-full bg-green animate-pulse" />
            Files updated in real-time
          </span>
        )}

        <div className="flex-1" />

        {allFiles.length > 0 && (
          <button
            onClick={() => downloadRepoZip(repoAddress.split(":").pop() || "repo", allFiles)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border text-text-secondary rounded-lg cursor-pointer bg-transparent hover:border-text-muted hover:text-text-primary"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14ZM7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z" />
            </svg>
            Download ZIP
          </button>
        )}

        {isMaintainer && (
          <>
            <button
              onClick={handleStartCreate}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green/15 text-green border border-green/30 rounded-lg cursor-pointer hover:bg-green/25"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z" />
              </svg>
              New file
            </button>
            <label className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border text-text-secondary rounded-lg cursor-pointer bg-transparent hover:border-text-muted hover:text-text-primary">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14ZM11.78 4.72a.749.749 0 1 1-1.06 1.06L8.75 3.811V9.5a.75.75 0 0 1-1.5 0V3.811L5.28 5.78a.749.749 0 1 1-1.06-1.06l3.25-3.25a.749.749 0 0 1 1.06 0l3.25 3.25Z" />
              </svg>
              Upload
              <input type="file" multiple className="hidden" onChange={(e) => e.target.files && handleUploadFiles(e.target.files)} />
            </label>
          </>
        )}
      </div>

      {error && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-sm text-red mb-3">{error}</div>
      )}

      {/* File browser */}
      <div className="flex gap-0 border border-border rounded-xl overflow-hidden min-h-[500px]">
        {/* Tree sidebar */}
        <div className="w-64 shrink-0 border-r border-border bg-bg-primary overflow-y-auto max-h-[600px]">
          <FileTree entries={allTree} selectedPath={selectedPath} onSelect={handleSelectFile} />
        </div>

        {/* File viewer */}
        <div className="flex-1 overflow-auto bg-bg-secondary">
          {selectedPath && selectedFile ? (
            <div>
              {/* File actions bar */}
              <div className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary border-b border-border">
                {isMaintainer && (
                  <>
                    <button onClick={handleStartEdit} className="text-xs px-2.5 py-1 border border-border rounded cursor-pointer bg-transparent text-text-secondary hover:text-text-primary hover:border-text-muted">
                      Edit
                    </button>
                    <button onClick={handleDelete} disabled={saving} className="text-xs px-2.5 py-1 border border-red/30 rounded cursor-pointer bg-transparent text-red hover:bg-red/10 disabled:opacity-50">
                      Delete
                    </button>
                  </>
                )}
                <button
                  onClick={handleShowHistory}
                  className={`text-xs px-2.5 py-1 border rounded cursor-pointer bg-transparent ${
                    showHistory ? "border-accent text-accent" : "border-border text-text-secondary hover:text-text-primary hover:border-text-muted"
                  }`}
                >
                  History
                </button>
                {viewingVersion && (
                  <>
                    <button onClick={() => setViewingVersion(null)} className="text-xs px-2.5 py-1 border border-accent/30 rounded cursor-pointer bg-accent/10 text-accent hover:bg-accent/20">
                      Current
                    </button>
                    <span className="text-xs text-text-muted ml-1">
                      Viewing version from {timeAgo(viewingVersion.createdAt)}
                    </span>
                  </>
                )}
              </div>

              {showHistory && (
                <VersionHistoryPanel
                  fileHistory={fileHistory}
                  historyLoading={historyLoading}
                  viewingVersion={viewingVersion}
                  onSelectVersion={setViewingVersion}
                />
              )}

              {/* File content */}
              {(() => {
                const displayInfo = encryption.getDisplayInfo(selectedFile);
                if (displayInfo.isEncrypted && !displayInfo.isDecrypted) {
                  return (
                    <EncryptionKeyPrompt
                      keyInput={encryption.keyInput}
                      decryptError={encryption.decryptError}
                      onKeyChange={encryption.setKeyInput}
                      onSubmit={encryption.submitKey}
                    />
                  );
                }
                return <FileContentView displayInfo={displayInfo} filePath={selectedPath} />;
              })()}
            </div>
          ) : (
            <div className="p-6">
              {readmeContent ? (
                <ReadmeView content={readmeContent} />
              ) : (
                <div className="flex items-center justify-center h-full text-text-muted text-sm min-h-[300px]">
                  Select a file to view its contents
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
