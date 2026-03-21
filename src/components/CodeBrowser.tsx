import { useState, useEffect } from "react";
import git from "isomorphic-git";
import {
  cloneRepo,
  listFiles,
  readFile,
  readAllFiles,
  listBranches,
  listTags,
  currentBranch,
  checkout,
  isCloned,
  deleteClone,
} from "../lib/git";
import { cloneFromBlossom, pushToBlossom, getFS } from "../lib/gitBlossom";
import { isBlossomUrl } from "../lib/blossom";
import { downloadZipFromEntries } from "../lib/zip";
import { publishRepo } from "../lib/nostr";
import { useAuth } from "../hooks/useAuth";
import type { FileEntry } from "../types/nostr";
import FileTree from "./FileTree";
import FileViewer from "./FileViewer";
import FileSearch from "./FileSearch";
import CodeSearch from "./CodeSearch";
import MarkdownContent from "./MarkdownContent";
import CommitHistory from "./CommitHistory";
import BlameView from "./BlameView";

interface Props {
  cloneUrls: string[];
  repoId: string;
  repoPubkey?: string;
  repoIdentifier?: string;
  repoName?: string;
  repoDescription?: string;
  repoTags?: string[];
}

export default function CodeBrowser({ cloneUrls, repoId, repoPubkey, repoIdentifier, repoName, repoDescription, repoTags }: Props) {
  const dir = `/${repoId}`;
  const { pubkey, signer } = useAuth();
  const isOwner = !!(pubkey && repoPubkey && pubkey === repoPubkey);
  // Categorize URLs
  const blossomUrls = cloneUrls.filter((u) => isBlossomUrl(u));
  const httpUrls = cloneUrls.filter((u) => /^https?:\/\//i.test(u) && !isBlossomUrl(u));
  const canBrowse = blossomUrls.length > 0 || httpUrls.length > 0;
  const [cloned, setCloned] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [activeBranch, setActiveBranch] = useState<string>("");
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [codeSearchOpen, setCodeSearchOpen] = useState(false);
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"code" | "blame" | "history">("code");

  // Editing state
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [creatingFile, setCreatingFile] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState("");

  useEffect(() => {
    if (cloned || cloning) return;
    let cancelled = false;
    isCloned(dir).then(async (yes) => {
      if (cancelled) return;
      if (yes) {
        setCloned(true);
        loadTree();
      } else if (blossomUrls.length > 0) {
        // Auto-clone from Blossom
        setCloning(true);
        setProgress("Downloading from Blossom...");
        try {
          await cloneFromBlossom(blossomUrls[0], dir, (msg) => setProgress(msg));
          if (cancelled) return;
          setCloned(true);
          await loadTree();
        } catch (err: unknown) {
          if (!cancelled) setError(err instanceof Error ? err.message : "Clone from Blossom failed");
        } finally {
          if (!cancelled) { setCloning(false); setProgress(""); }
        }
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir, blossomUrls.length]);

  // Keyboard shortcut for file search
  useEffect(() => {
    if (!cloned) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        setFileSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cloned]);

  const loadTree = async () => {
    const [tree, br, tg, cur] = await Promise.all([
      listFiles(dir),
      listBranches(dir),
      listTags(dir),
      currentBranch(dir),
    ]);
    setFiles(tree);
    setBranches(br);
    setTags(tg);
    setActiveBranch(cur ?? "");

    // Try to load README
    const readmeNames = ["README.md", "readme.md", "Readme.md", "README.MD"];
    for (const name of readmeNames) {
      try {
        const content = await readFile(dir, name);
        if (content !== null) {
          setReadmeContent(content);
          break;
        }
      } catch { /* not found */ }
    }
  };

  const handleClone = async () => {
    if (!canBrowse) {
      setError("No browsable clone URL available");
      return;
    }
    setCloning(true);
    setError("");
    setProgress("Starting clone...");
    try {
      if (blossomUrls.length > 0) {
        // Clone from Blossom packfile
        await cloneFromBlossom(blossomUrls[0], dir, (msg) => setProgress(msg));
      } else {
        // Fall back to HTTP git clone
        await cloneRepo(httpUrls[0], dir, (phase, loaded, total) => {
          setProgress(`${phase}: ${loaded}${total ? `/${total}` : ""}`);
        });
      }
      setCloned(true);
      await loadTree();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Clone failed";
      if (msg.includes("404")) {
        setError(`Repository not found — the clone URL may be broken or the repository was deleted upstream.`);
      } else if (msg.includes("CORS") || msg.includes("Failed to fetch")) {
        setError(`Network error — the clone URL may be unreachable or blocked by CORS.`);
      } else {
        setError(msg);
      }
    } finally {
      setCloning(false);
      setProgress("");
    }
  };

  const handleReclone = async () => {
    await deleteClone(dir);
    setCloned(false);
    setFiles([]);
    setSelectedPath(undefined);
    setFileContent(null);
    setReadmeContent(null);
    // Trigger a fresh clone
    setCloning(true);
    setError("");
    setProgress("Re-cloning...");
    try {
      if (blossomUrls.length > 0) {
        await cloneFromBlossom(blossomUrls[0], dir, (msg) => setProgress(msg));
      } else if (httpUrls.length > 0) {
        await cloneRepo(httpUrls[0], dir, (phase, loaded, total) => {
          setProgress(`${phase}: ${loaded}${total ? `/${total}` : ""}`);
        });
      }
      setCloned(true);
      await loadTree();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Re-clone failed");
    } finally {
      setCloning(false);
      setProgress("");
    }
  };

  const handleSelectFile = async (path: string) => {
    setEditing(false);
    setCreatingFile(false);
    setSelectedPath(path);
    const content = await readFile(dir, path);
    setFileContent(content);
  };

  const handleStartEdit = () => {
    if (fileContent !== null) {
      setEditContent(fileContent);
      setEditing(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedPath) return;
    const fsInstance = getFS();
    await fsInstance.promises.writeFile(`${dir}/${selectedPath}`, editContent);
    await git.add({ fs: fsInstance, dir, filepath: selectedPath });
    setFileContent(editContent);
    setEditing(false);
    if (!commitMsg) setCommitMsg(`Update ${selectedPath}`);
  };

  const handleCreateFile = async () => {
    const name = newFileName.trim();
    if (!name) return;
    const fsInstance = getFS();
    // Create parent directories if needed
    const parts = name.split("/");
    if (parts.length > 1) {
      let current = dir;
      for (let i = 0; i < parts.length - 1; i++) {
        current += "/" + parts[i];
        try { await fsInstance.promises.mkdir(current); } catch { /* exists */ }
      }
    }
    await fsInstance.promises.writeFile(`${dir}/${name}`, "");
    await git.add({ fs: fsInstance, dir, filepath: name });
    setCreatingFile(false);
    setNewFileName("");
    if (!commitMsg) setCommitMsg(`Add ${name}`);
    await loadTree();
    handleSelectFile(name);
    // Start editing the new file immediately
    setEditContent("");
    setEditing(true);
  };

  const handleDeleteFile = async () => {
    if (!selectedPath) return;
    const fsInstance = getFS();
    await fsInstance.promises.unlink(`${dir}/${selectedPath}`);
    await git.remove({ fs: fsInstance, dir, filepath: selectedPath });
    if (!commitMsg) setCommitMsg(`Delete ${selectedPath}`);
    setSelectedPath(undefined);
    setFileContent(null);
    setEditing(false);
    await loadTree();
  };

  const handleCommitAndPush = async () => {
    if (!signer || !commitMsg.trim()) return;
    setPushing(true);
    setPushStatus("Committing...");
    setError("");
    try {
      const fsInstance = getFS();
      await git.commit({
        fs: fsInstance,
        dir,
        message: commitMsg.trim(),
        author: {
          name: pubkey ? pubkey.slice(0, 8) : "anonymous",
          email: `${pubkey ? pubkey.slice(0, 8) : "anon"}@nostr`,
        },
      });

      setPushStatus("Pushing to Blossom...");
      const blossomUrl = await pushToBlossom(signer, dir, undefined, (msg) =>
        setPushStatus(msg),
      );

      // Update the repo announcement with the new Blossom URL if we have repo info
      if (repoIdentifier && repoPubkey) {
        setPushStatus("Updating repo announcement...");
        // Merge: keep non-blossom URLs, replace/add blossom URL
        const updatedCloneUrls = [
          ...cloneUrls.filter((u) => !isBlossomUrl(u)),
          blossomUrl,
        ];
        await publishRepo(signer, {
          identifier: repoIdentifier,
          name: repoName || repoIdentifier,
          description: repoDescription || "",
          cloneUrls: updatedCloneUrls,
          tags: repoTags || [],
        });
      }

      setCommitMsg("");
      setPushStatus("Pushed successfully!");
      await loadTree();
      setTimeout(() => setPushStatus(""), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Push failed");
    } finally {
      setPushing(false);
    }
  };

  const handleCheckout = async (ref: string) => {
    try {
      await checkout(dir, ref);
      setActiveBranch(ref);
      setBranchMenuOpen(false);
      await loadTree();
      setSelectedPath(undefined);
      setFileContent(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    }
  };

  if (!cloned) {
    return (
      <div className="border border-border rounded-xl p-8 bg-bg-secondary text-center">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 text-text-muted">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        {cloneUrls.length > 0 ? (
          <>
            <p className="text-text-secondary mb-4">Clone this repository</p>
            <div className="max-w-lg mx-auto text-left mb-4">
              {cloneUrls.map((url) => (
                <div key={url} className="flex items-center gap-2 mb-2">
                  <code className="text-xs bg-bg-primary px-3 py-1.5 rounded border border-border flex-1 font-mono truncate">
                    git clone {url}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(`git clone ${url}`)}
                    className="btn btn-sm shrink-0"
                  >
                    Copy
                  </button>
                </div>
              ))}
            </div>
            {error && (
              <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-sm text-red mb-4 max-w-md mx-auto">
                {error}
              </div>
            )}
            {progress && (
              <div className="mb-3 max-w-md mx-auto">
                <p className="text-sm text-accent mb-2">{progress}</p>
                <div className="w-full h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full animate-pulse" style={{ width: "60%" }} />
                </div>
              </div>
            )}
            {canBrowse && (
              <button
                onClick={handleClone}
                disabled={cloning}
                className="px-6 py-2.5 bg-green text-white rounded-lg font-medium hover:brightness-110 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                {cloning ? "Cloning..." : "Browse in browser"}
              </button>
            )}
            {!canBrowse && (
              <p className="text-xs text-text-muted mt-2">
                Browser cloning requires an HTTP(S) or Blossom URL. Use the clone commands above.
              </p>
            )}
          </>
        ) : (
          <p className="text-text-muted">No clone URL provided for this repository</p>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3">
        {/* Branch selector */}
        <div className="relative">
          <button
            onClick={() => setBranchMenuOpen(!branchMenuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-bg-tertiary border border-border rounded-lg hover:border-text-muted cursor-pointer text-text-primary"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
              <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
            </svg>
            <span className="font-mono">{activeBranch || "HEAD"}</span>
            <span className="text-text-muted text-xs">▼</span>
          </button>
          {branchMenuOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-bg-secondary border border-border rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
              {branches.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs text-text-muted font-medium border-b border-border">
                    Branches
                  </div>
                  {branches.map((b) => (
                    <button
                      key={b}
                      onClick={() => handleCheckout(b)}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-bg-tertiary cursor-pointer bg-transparent border-0 ${
                        b === activeBranch ? "text-accent font-medium" : "text-text-primary"
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              )}
              {tags.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs text-text-muted font-medium border-b border-border border-t">
                    Tags
                  </div>
                  {tags.map((t) => (
                    <button
                      key={t}
                      onClick={() => handleCheckout(t)}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-bg-tertiary cursor-pointer bg-transparent border-0 text-text-primary"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* File search button */}
        <button
          onClick={() => setFileSearchOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-muted hover:text-text-secondary border border-border rounded-lg cursor-pointer bg-transparent hover:border-text-muted"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="hide-mobile">Find file</span>
          <kbd className="px-1 py-0.5 bg-bg-tertiary border border-border rounded text-[10px] font-mono hide-mobile">Ctrl+P</kbd>
        </button>

        {/* Code search button */}
        <button
          onClick={() => setCodeSearchOpen(!codeSearchOpen)}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-lg cursor-pointer hover:border-text-muted ${
            codeSearchOpen ? "bg-accent/10 text-accent border-accent/30" : "text-text-muted hover:text-text-secondary bg-transparent"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="m11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L13.94 8l-3.72-3.72a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Zm-6.56 0a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L2.06 8l3.72 3.72a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L.47 8.53a.75.75 0 0 1 0-1.06Z"/>
          </svg>
          <span className="hide-mobile">Search code</span>
        </button>

        {/* New file button (owner only) */}
        {isOwner && blossomUrls.length > 0 && (
          <button
            onClick={() => { setCreatingFile(true); setNewFileName(""); }}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-border text-green rounded-lg cursor-pointer bg-transparent hover:border-green/50"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 10.25 10H7.061l-2.574 2.573A1.458 1.458 0 0 1 2 11.543V10h-.25A1.75 1.75 0 0 1 0 8.25v-5.5C0 1.784.784 1 1.75 1ZM8 4a.75.75 0 0 0-1.5 0v1.5H5a.75.75 0 0 0 0 1.5h1.5V8.5a.75.75 0 0 0 1.5 0V7h1.5a.75.75 0 0 0 0-1.5H8Z" />
            </svg>
            <span className="hide-mobile">New file</span>
          </button>
        )}

        <div className="flex-1" />

        {/* Download ZIP */}
        <button
          onClick={async () => {
            const allFiles = await readAllFiles(dir);
            downloadZipFromEntries(repoId, allFiles);
          }}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-border text-text-secondary rounded-lg cursor-pointer bg-transparent hover:border-text-muted hover:text-text-primary"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14ZM7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z" />
          </svg>
          <span className="hide-mobile">Download ZIP</span>
        </button>

        {/* History toggle */}
        <button
          onClick={() => setViewMode(viewMode === "history" ? "code" : "history")}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-border rounded-lg cursor-pointer hover:border-text-muted ${
            viewMode === "history" ? "bg-accent/10 text-accent border-accent/30" : "text-text-muted hover:text-text-secondary bg-transparent"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z" />
          </svg>
          <span className="hide-mobile">History</span>
        </button>

        {/* Blame toggle (only when a file is selected) */}
        {selectedPath && !selectedPath.toLowerCase().endsWith(".md") && (
          <button
            onClick={() => setViewMode(viewMode === "blame" ? "code" : "blame")}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-border rounded-lg cursor-pointer hover:border-text-muted ${
              viewMode === "blame" ? "bg-accent/10 text-accent border-accent/30" : "text-text-muted hover:text-text-secondary bg-transparent"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2h1v1H4V2Zm1 2H4v1h1V4ZM3 2H2v1h1V2Zm2 6H4v1h1V8ZM3 8H2v1h1V8Zm2-2H4v1h1V6ZM3 6H2v1h1V6Zm5-4h6v1H8V2Zm6 2H8v1h6V4ZM8 6h6v1H8V6Zm6 2H8v1h6V8Z" />
            </svg>
            <span className="hide-mobile">Blame</span>
          </button>
        )}

        <button
          onClick={handleReclone}
          className="text-xs px-2.5 py-1.5 text-text-muted hover:text-text-secondary border border-border rounded-lg cursor-pointer bg-transparent hover:border-text-muted"
        >
          Re-clone
        </button>
      </div>

      {error && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-sm text-red mb-3">
          {error}
        </div>
      )}

      {/* New file dialog */}
      {creatingFile && (
        <div className="border border-green/30 bg-green/5 rounded-lg p-4 mb-3">
          <p className="text-sm font-medium text-text-primary mb-2">Create new file</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="path/to/filename.ext"
              className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-1.5 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              onKeyDown={(e) => e.key === "Enter" && handleCreateFile()}
              autoFocus
            />
            <button onClick={handleCreateFile} disabled={!newFileName.trim()} className="btn btn-sm bg-green text-white border-green hover:brightness-110 disabled:opacity-40">
              Create
            </button>
            <button onClick={() => setCreatingFile(false)} className="btn btn-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Commit & Push panel (owner only, when Blossom) */}
      {isOwner && blossomUrls.length > 0 && commitMsg && (
        <div className="border border-accent/30 bg-accent/5 rounded-lg p-4 mb-3">
          <p className="text-sm font-medium text-text-primary mb-2">Commit & Push</p>
          {pushStatus && (
            <p className="text-xs text-accent mb-2 flex items-center gap-2">
              {pushing && <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />}
              {pushStatus}
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Commit message"
              className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              onKeyDown={(e) => e.key === "Enter" && !pushing && handleCommitAndPush()}
            />
            <button
              onClick={handleCommitAndPush}
              disabled={pushing || !commitMsg.trim()}
              className="btn btn-sm bg-accent text-white border-accent hover:brightness-110 disabled:opacity-40"
            >
              {pushing ? "Pushing..." : "Commit & Push"}
            </button>
            <button onClick={() => setCommitMsg("")} disabled={pushing} className="btn btn-sm">
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Code search panel */}
      {codeSearchOpen && (
        <div className="mb-3 border border-border rounded-lg p-3 bg-bg-secondary">
          <CodeSearch
            repoDir={dir}
            files={files}
            onResultClick={(path) => { handleSelectFile(path); setCodeSearchOpen(false); }}
          />
        </div>
      )}

      {/* Commit history view */}
      {viewMode === "history" && (
        <CommitHistory repoDir={dir} />
      )}

      {/* Blame view */}
      {viewMode === "blame" && selectedPath && (
        <BlameView repoDir={dir} filepath={selectedPath} />
      )}

      {/* File browser */}
      {viewMode === "code" && (
        <div className="flex gap-0 border border-border rounded-xl overflow-hidden min-h-[500px]">
          {/* Tree sidebar */}
          <div className="w-64 shrink-0 border-r border-border bg-bg-primary overflow-y-auto max-h-[600px]">
            <FileTree entries={files} selectedPath={selectedPath} onSelect={handleSelectFile} />
          </div>
          {/* File viewer */}
          <div className="flex-1 overflow-auto bg-bg-secondary">
            {selectedPath && fileContent !== null ? (
              editing ? (
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-mono text-text-secondary">{selectedPath}</span>
                    <span className="text-xs text-accent">editing</span>
                    <div className="flex-1" />
                    <button onClick={handleSaveEdit} className="btn btn-sm bg-green text-white border-green hover:brightness-110">
                      Save
                    </button>
                    <button onClick={() => setEditing(false)} className="btn btn-sm">
                      Cancel
                    </button>
                  </div>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full min-h-[400px] bg-bg-primary border border-border rounded-lg px-4 py-3 font-mono text-sm text-text-primary resize-y focus:outline-none focus:border-accent"
                    spellCheck={false}
                  />
                </div>
              ) : (
                <div>
                  {/* Edit/Delete toolbar for owners */}
                  {isOwner && blossomUrls.length > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-bg-tertiary/50">
                      <span className="text-xs font-mono text-text-muted flex-1">{selectedPath}</span>
                      <button
                        onClick={handleStartEdit}
                        className="flex items-center gap-1 text-xs px-2 py-1 text-accent border border-accent/30 rounded cursor-pointer bg-transparent hover:bg-accent/10"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758ZM11.542 2.5a.25.25 0 0 0-.354 0l-1.44 1.44 2.312 2.312 1.44-1.44a.25.25 0 0 0 0-.354ZM10.586 7.727 8.274 5.414l-5.838 5.838a.25.25 0 0 0-.056.108l-.592 2.071 2.071-.592a.25.25 0 0 0 .108-.056Z" />
                        </svg>
                        Edit
                      </button>
                      <button
                        onClick={handleDeleteFile}
                        className="flex items-center gap-1 text-xs px-2 py-1 text-red border border-red/30 rounded cursor-pointer bg-transparent hover:bg-red/10"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  )}
                  {selectedPath.toLowerCase().endsWith(".md") ? (
                    <div className="p-6">
                      <div className="bg-bg-tertiary px-4 py-2 text-sm text-text-secondary border-b border-border rounded-t-lg font-mono mb-0">
                        {selectedPath}
                      </div>
                      <div className="border border-border border-t-0 rounded-b-lg p-4 bg-bg-primary">
                        <MarkdownContent content={fileContent} />
                      </div>
                    </div>
                  ) : (
                    <FileViewer content={fileContent} filename={selectedPath} />
                  )}
                </div>
              )
            ) : (
              <div className="p-6">
                {readmeContent ? (
                  <div>
                    <div className="bg-bg-tertiary px-4 py-2 text-sm text-text-secondary border border-border rounded-t-lg font-mono flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      README.md
                    </div>
                    <div className="border border-border border-t-0 rounded-b-lg p-6 bg-bg-primary">
                      <MarkdownContent content={readmeContent} />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-text-muted text-sm min-h-[300px]">
                    Select a file to view its contents
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* File search overlay */}
      {fileSearchOpen && (
        <FileSearch
          files={files}
          onSelect={handleSelectFile}
          onClose={() => setFileSearchOpen(false)}
        />
      )}
    </div>
  );
}
