import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useRelays } from "../hooks/useRelays";
import { useToast } from "../components/Toast";
import {
  publishRepo,
  publishFileBlob,
  repoAddress,
  npubFromPubkey,
  DEFAULT_RELAYS,
} from "../lib/nostr";

const MAX_FILE_SIZE = 100_000;

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "svg",
  "woff", "woff2", "ttf", "eot", "otf",
  "zip", "gz", "tar", "bz2", "7z", "rar",
  "pdf", "doc", "docx", "xls", "xlsx",
  "exe", "dll", "so", "dylib", "o", "a",
  "mp3", "mp4", "avi", "mov", "wav", "ogg",
  "wasm", "pyc", "class",
]);

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname !== "github.com") return null;
    const parts = u.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    const owner = parts[0];
    const repo = parts[1];
    // Validate owner/repo contain only safe characters (alphanumeric, hyphen, underscore, dot)
    if (!/^[a-zA-Z0-9._-]+$/.test(owner) || !/^[a-zA-Z0-9._-]+$/.test(repo)) return null;
    // Reject path traversal
    if (owner.includes("..") || repo.includes("..")) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

function getExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return "";
  return path.slice(dot + 1).toLowerCase();
}

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

interface GitHubRepoInfo {
  name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  topics?: string[];
}

export default function ImportPage() {
  const { pubkey, signer } = useAuth();
  const { globalRelays } = useRelays();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [githubUrl, setGithubUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState("");

  const relays = globalRelays.length > 0 ? globalRelays : DEFAULT_RELAYS;

  if (!pubkey || !signer) {
    return (
      <div className="text-center py-20">
        <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" className="mx-auto mb-4 text-text-muted">
          <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
        </svg>
        <p className="text-text-secondary mb-3">Sign in to import a repository</p>
        <Link to="/login" className="btn btn-primary no-underline hover:no-underline">
          Sign in
        </Link>
      </div>
    );
  }

  async function handleImport() {
    if (!signer || !pubkey) return;

    const parsed = parseGitHubUrl(githubUrl);
    if (!parsed) {
      setError("Invalid GitHub URL. Expected format: https://github.com/owner/repo");
      return;
    }

    setError("");
    setImporting(true);
    setStatus("Fetching repository info...");
    setProgress(null);

    try {
      // 1. Fetch repo metadata
      const repoRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
      if (repoRes.status === 403) {
        throw new Error("GitHub API rate limit exceeded. Please wait a few minutes and try again.");
      }
      if (repoRes.status === 404) {
        throw new Error("Repository not found. Make sure it exists and is public.");
      }
      if (!repoRes.ok) {
        throw new Error(`GitHub API error: ${repoRes.status} ${repoRes.statusText}`);
      }
      const repoInfo: GitHubRepoInfo = await repoRes.json();

      // 2. Fetch file tree
      setStatus("Fetching file tree...");
      const treeRes = await fetch(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/HEAD?recursive=1`
      );
      if (treeRes.status === 403) {
        throw new Error("GitHub API rate limit exceeded. Please wait a few minutes and try again.");
      }
      if (!treeRes.ok) {
        throw new Error(`Failed to fetch file tree: ${treeRes.status} ${treeRes.statusText}`);
      }
      const treeData = await treeRes.json();
      const blobs: GitHubTreeItem[] = (treeData.tree as GitHubTreeItem[]).filter(
        (item) => item.type === "blob"
      );

      // Filter out binary and oversized files
      const filesToImport = blobs.filter((item) => {
        const ext = getExtension(item.path);
        if (BINARY_EXTENSIONS.has(ext)) return false;
        if (item.size && item.size > MAX_FILE_SIZE) return false;
        return true;
      });

      // 3. Create repo announcement
      setStatus("Publishing repository announcement...");
      const identifier = repoInfo.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      await publishRepo(
        signer,
        {
          identifier,
          name: repoInfo.name,
          description: repoInfo.description ?? "",
          cloneUrls: [repoInfo.clone_url],
          webUrls: [repoInfo.html_url],
          tags: repoInfo.topics ?? [],
        },
        relays
      );

      const repoAddr = repoAddress(pubkey, identifier);

      // 4. Import files one by one
      let imported = 0;
      let skipped = 0;
      for (let i = 0; i < filesToImport.length; i++) {
        const file = filesToImport[i];
        setProgress({ current: i + 1, total: filesToImport.length });
        setStatus(`Importing file ${i + 1}/${filesToImport.length}: ${file.path}`);

        try {
          const contentRes = await fetch(
            `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${file.path}`,
            {
              headers: {
                Accept: "application/vnd.github.raw",
              },
            }
          );

          if (contentRes.status === 403) {
            throw new Error("GitHub API rate limit exceeded. Please wait a few minutes and try again.");
          }

          if (!contentRes.ok) {
            skipped++;
            continue;
          }

          const content = await contentRes.text();

          // Skip if content ended up being too large
          if (content.length > MAX_FILE_SIZE) {
            skipped++;
            continue;
          }

          await publishFileBlob(
            signer,
            {
              repoAddress: repoAddr,
              repoPubkey: pubkey,
              filePath: file.path,
              content,
            },
            relays
          );

          imported++;

          // Small delay to avoid overwhelming relays
          if (i < filesToImport.length - 1) {
            await new Promise((r) => setTimeout(r, 100));
          }
        } catch (err: unknown) {
          // Re-throw rate limit errors
          if (err instanceof Error && err.message?.includes("rate limit")) throw err;
          // Otherwise skip this file
          skipped++;
        }
      }

      setStatus("Import complete!");
      setProgress(null);
      toast(
        `Imported ${imported} files${skipped > 0 ? ` (${skipped} skipped)` : ""} from ${repoInfo.name}`,
        "success"
      );

      // Navigate to the new repo
      const npub = npubFromPubkey(pubkey);
      navigate(`/repo/${npub}/${identifier}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStatus("");
      setProgress(null);
    } finally {
      setImporting(false);
    }
  }

  const parsed = parseGitHubUrl(githubUrl);
  const isValid = parsed !== null;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-text-primary mb-2">Import from GitHub</h1>
      <p className="text-text-secondary mb-6">
        Import a public GitHub repository by fetching its files and publishing them as Nostr events.
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="github-url" className="block text-sm font-medium text-text-primary mb-1.5">
            GitHub Repository URL
          </label>
          <input
            id="github-url"
            type="url"
            value={githubUrl}
            onChange={(e) => {
              setGithubUrl(e.target.value);
              setError("");
            }}
            placeholder="https://github.com/owner/repo"
            disabled={importing}
            className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50"
          />
          {githubUrl && !isValid && (
            <p className="text-sm text-red mt-1">
              Enter a valid GitHub URL (e.g., https://github.com/owner/repo)
            </p>
          )}
          {parsed && (
            <p className="text-sm text-text-muted mt-1">
              Repository: <span className="text-text-secondary font-mono">{parsed.owner}/{parsed.repo}</span>
            </p>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red/10 border border-red/30 rounded-lg text-red text-sm">
            {error}
          </div>
        )}

        {importing && (
          <div className="p-4 bg-bg-secondary border border-border rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-text-primary">{status}</span>
            </div>
            {progress && (
              <div className="mt-2">
                <div className="w-full h-2 bg-bg-tertiary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-text-muted mt-1">
                  {progress.current} / {progress.total} files
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleImport}
            disabled={importing || !isValid}
            className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing ? "Importing..." : "Import Repository"}
          </button>
          <button
            onClick={() => navigate(-1)}
            disabled={importing}
            className="btn btn-secondary disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        <div className="mt-6 p-4 bg-bg-secondary border border-border rounded-lg">
          <h3 className="text-sm font-medium text-text-primary mb-2">Notes</h3>
          <ul className="text-xs text-text-muted space-y-1 list-disc list-inside">
            <li>Only public repositories can be imported (no authentication required)</li>
            <li>Binary files (images, archives, executables, etc.) are skipped</li>
            <li>Files larger than 100KB are skipped</li>
            <li>The GitHub API has rate limits (~60 requests/hour for unauthenticated access)</li>
            <li>Large repositories may take several minutes to import</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
