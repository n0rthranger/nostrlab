import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import LightningFS from "@isomorphic-git/lightning-fs";
import type { FileEntry } from "../types/nostr";

const CORS_PROXY = "https://cors.isomorphic-git.org";

let fs: LightningFS | null = null;

export function getFS(): LightningFS {
  if (!fs) fs = new LightningFS("gitnostr");
  return fs;
}

export async function cloneRepo(
  url: string,
  dir: string,
  onProgress?: (phase: string, loaded: number, total: number) => void
): Promise<void> {
  const fsInstance = getFS();
  // Check if already cloned
  try {
    const existing = await fsInstance.promises.readdir(dir);
    if (existing.length > 0) return;
  } catch {
    // dir doesn't exist, proceed with clone
  }

  await git.clone({
    fs: fsInstance,
    http,
    dir,
    url,
    corsProxy: CORS_PROXY,
    depth: 1,
    singleBranch: false,
    onProgress: onProgress
      ? (progress) => onProgress(progress.phase, progress.loaded, progress.total ?? 0)
      : undefined,
  });
}

export async function listBranches(dir: string): Promise<string[]> {
  return git.listBranches({ fs: getFS(), dir });
}

export async function listTags(dir: string): Promise<string[]> {
  return git.listTags({ fs: getFS(), dir });
}

export async function currentBranch(dir: string): Promise<string | undefined> {
  return (await git.currentBranch({ fs: getFS(), dir })) ?? undefined;
}

export async function checkout(dir: string, ref: string): Promise<void> {
  await git.checkout({ fs: getFS(), dir, ref });
}

export async function listFiles(dir: string, path: string = "."): Promise<FileEntry[]> {
  const fsInstance = getFS();
  const fullPath = path === "." ? dir : `${dir}/${path}`;
  const entries: FileEntry[] = [];

  try {
    const items = await fsInstance.promises.readdir(fullPath);
    for (const item of items) {
      if (item === ".git") continue;
      const itemPath = path === "." ? item : `${path}/${item}`;
      const stat = await fsInstance.promises.stat(`${dir}/${itemPath}`);
      if (stat.isDirectory()) {
        const children = await listFiles(dir, itemPath);
        entries.push({ name: item, path: itemPath, type: "dir", children });
      } else {
        entries.push({ name: item, path: itemPath, type: "file" });
      }
    }
  } catch {
    // directory might not exist
  }

  // Sort: dirs first, then files, alphabetically
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

export async function readFile(dir: string, path: string): Promise<string | null> {
  // Prevent path traversal
  const normalized = path.replace(/\\/g, "/");
  if (normalized.includes("..") || normalized.startsWith("/")) return null;
  try {
    const content = await getFS().promises.readFile(`${dir}/${normalized}`, { encoding: "utf8" });
    return content as string;
  } catch {
    return null;
  }
}

export async function readAllFiles(dir: string, path: string = "."): Promise<{ path: string; content: Uint8Array }[]> {
  const fsInstance = getFS();
  const fullPath = path === "." ? dir : `${dir}/${path}`;
  const results: { path: string; content: Uint8Array }[] = [];

  try {
    const items = await fsInstance.promises.readdir(fullPath);
    for (const item of items) {
      if (item === ".git") continue;
      const itemPath = path === "." ? item : `${path}/${item}`;
      const stat = await fsInstance.promises.stat(`${dir}/${itemPath}`);
      if (stat.isDirectory()) {
        const children = await readAllFiles(dir, itemPath);
        results.push(...children);
      } else {
        try {
          const content = await fsInstance.promises.readFile(`${dir}/${itemPath}`);
          const bytes = content instanceof Uint8Array ? content : new TextEncoder().encode(String(content));
          results.push({ path: itemPath, content: bytes });
        } catch {
          // skip unreadable files
        }
      }
    }
  } catch {
    // directory might not exist
  }

  return results;
}

export async function isCloned(dir: string): Promise<boolean> {
  try {
    const entries = await getFS().promises.readdir(dir);
    return entries.length > 0;
  } catch {
    return false;
  }
}

export async function deleteClone(dir: string): Promise<void> {
  const fsInstance = getFS();
  async function rmrf(path: string) {
    try {
      const stat = await fsInstance.promises.stat(path);
      if (stat.isDirectory()) {
        const items = await fsInstance.promises.readdir(path);
        for (const item of items) {
          await rmrf(`${path}/${item}`);
        }
        await fsInstance.promises.rmdir(path);
      } else {
        await fsInstance.promises.unlink(path);
      }
    } catch {
      // ignore
    }
  }
  await rmrf(dir);
}

// ── Git Log ──

export interface CommitInfo {
  oid: string;
  message: string;
  author: { name: string; email: string; timestamp: number };
  parent: string[];
}

export async function gitLog(dir: string, depth = 50): Promise<CommitInfo[]> {
  try {
    const commits = await git.log({ fs: getFS(), dir, depth });
    return commits.map((c) => ({
      oid: c.oid,
      message: c.commit.message,
      author: {
        name: c.commit.author.name,
        email: c.commit.author.email,
        timestamp: c.commit.author.timestamp,
      },
      parent: c.commit.parent,
    }));
  } catch {
    return [];
  }
}

// ── Git Blame (approximate — walk log per file) ──

export interface BlameLine {
  lineNumber: number;
  content: string;
  commitOid: string;
  author: string;
  timestamp: number;
}

export async function gitBlame(dir: string, filepath: string): Promise<BlameLine[]> {
  const fsInstance = getFS();
  // Read current file content
  const content = await readFile(dir, filepath);
  if (!content) return [];
  const lines = content.split("\n");

  // Get the latest commit that touched this file
  try {
    const commits = await git.log({ fs: fsInstance, dir, filepath, depth: 1 });
    const lastCommit = commits[0];
    const author = lastCommit?.commit.author.name ?? "unknown";
    const timestamp = lastCommit?.commit.author.timestamp ?? 0;
    const oid = lastCommit?.oid ?? "unknown";

    // Simple blame: attribute all lines to the last commit that touched the file
    return lines.map((line, i) => ({
      lineNumber: i + 1,
      content: line,
      commitOid: oid,
      author,
      timestamp,
    }));
  } catch {
    return lines.map((line, i) => ({
      lineNumber: i + 1,
      content: line,
      commitOid: "unknown",
      author: "unknown",
      timestamp: 0,
    }));
  }
}

export function detectLanguage(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", rb: "ruby", java: "java",
    c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp",
    swift: "swift", kt: "kotlin", scala: "scala", zig: "zig",
    sh: "bash", bash: "bash", zsh: "bash",
    html: "html", css: "css", scss: "scss", less: "less",
    json: "json", yaml: "yaml", yml: "yaml", toml: "ini",
    md: "markdown", xml: "xml", sql: "sql", graphql: "graphql",
    dockerfile: "dockerfile", makefile: "makefile",
    lua: "lua", r: "r", dart: "dart", elixir: "elixir", ex: "elixir",
    erl: "erlang", hs: "haskell", ml: "ocaml", nim: "nim",
    nix: "nix", sol: "solidity", vue: "xml", svelte: "xml",
  };
  return ext ? map[ext] : undefined;
}

export function isBinaryFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  const binary = new Set([
    "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "svg",
    "woff", "woff2", "ttf", "eot", "otf",
    "zip", "gz", "tar", "bz2", "7z", "rar",
    "pdf", "doc", "docx", "xls", "xlsx",
    "exe", "dll", "so", "dylib", "o", "a",
    "mp3", "mp4", "avi", "mov", "wav", "ogg",
    "wasm", "pyc", "class",
  ]);
  return ext ? binary.has(ext) : false;
}
