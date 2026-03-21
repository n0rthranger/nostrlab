#!/usr/bin/env node
/**
 * git-remote-blossom — Git remote helper for Blossom (BUD-01).
 *
 * Enables: git clone blossom://<identifier>
 *          git push blossom <branch>
 *
 * Git calls this binary as: git-remote-blossom <remote-name> <url>
 * Communication happens via stdin/stdout using the git remote helper protocol.
 * Diagnostic messages go to stderr.
 */
import { createInterface } from "readline";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadKeys } from "./auth.js";
import { uploadBlob, downloadBlob, isBlossomUrl } from "./blossom.js";
import {
  resolveIdentifier,
  fetchRepoAnnouncement,
  fetchRepoState,
  publishRepoAnnouncement,
  publishRepoState,
  closePool,
  type RepoInfo,
  type RepoRefs,
} from "./nostr.js";

const log = (msg: string) => process.stderr.write(`remote: ${msg}\n`);

// Parse args: git-remote-blossom <remote-name> <url>
const [, , , url] = process.argv;

if (!url) {
  log("Usage: git-remote-blossom <remote-name> <url>");
  process.exit(1);
}

// Strip blossom:// prefix
const identifier = url.replace(/^blossom:\/\//, "");

let repoInfo: RepoInfo | null = null;
let repoRefs: RepoRefs | null = null;
let resolved: { pubkey: string; repoIdentifier: string; relays: string[] } | null = null;

async function ensureResolved(): Promise<void> {
  if (resolved) return;
  resolved = resolveIdentifier(identifier);
  log(`Resolving ${resolved.repoIdentifier} from Nostr relays...`);
  repoInfo = await fetchRepoAnnouncement(
    resolved.pubkey,
    resolved.repoIdentifier,
    resolved.relays,
  );
  if (!repoInfo) {
    log(`Repository not found on relays for ${resolved.pubkey}/${resolved.repoIdentifier}`);
  }
  repoRefs = await fetchRepoState(
    resolved.pubkey,
    resolved.repoIdentifier,
    resolved.relays,
  );
}

function getBlossomUrl(): string | null {
  if (!repoInfo) return null;
  return repoInfo.cloneUrls.find((u) => isBlossomUrl(u)) ?? null;
}

// ── Command handlers ──

function handleCapabilities(): void {
  process.stdout.write("fetch\n");
  process.stdout.write("push\n");
  process.stdout.write("\n");
}

async function handleList(): Promise<void> {
  await ensureResolved();

  if (repoRefs && Object.keys(repoRefs.refs).length > 0) {
    for (const [ref, sha] of Object.entries(repoRefs.refs)) {
      process.stdout.write(`${sha} ${ref}\n`);
    }
    if (repoRefs.head) {
      process.stdout.write(`@${repoRefs.head} HEAD\n`);
    }
  } else {
    // No repo state event — try to get refs from the packfile
    const blossomUrl = getBlossomUrl();
    if (blossomUrl) {
      try {
        const refs = await getRefsFromPackfile(blossomUrl);
        for (const [ref, sha] of Object.entries(refs)) {
          process.stdout.write(`${sha} ${ref}\n`);
        }
        // Guess HEAD
        if (refs["refs/heads/main"]) {
          process.stdout.write(`@refs/heads/main HEAD\n`);
        } else if (refs["refs/heads/master"]) {
          process.stdout.write(`@refs/heads/master HEAD\n`);
        }
      } catch (err) {
        log(`Warning: could not read refs from packfile: ${err}`);
      }
    }
  }

  process.stdout.write("\n");
}

async function getRefsFromPackfile(
  blossomUrl: string,
): Promise<Record<string, string>> {
  log("Downloading packfile to read refs...");
  const data = await downloadBlob(blossomUrl);

  // Write to temp, index it, use git to read refs
  const tmpDir = join(tmpdir(), `grb-${Date.now()}`);
  mkdirSync(join(tmpDir, ".git", "objects", "pack"), { recursive: true });
  mkdirSync(join(tmpDir, ".git", "refs", "heads"), { recursive: true });
  writeFileSync(join(tmpDir, ".git", "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(
    join(tmpDir, ".git", "config"),
    "[core]\n\trepositoryformatversion = 0\n\tbare = false\n",
  );

  const packPath = join(tmpDir, ".git", "objects", "pack", "tmp.pack");
  writeFileSync(packPath, data);

  try {
    execSync(`git index-pack "${packPath}"`, { cwd: tmpDir, stdio: "pipe" });
  } catch {
    // index-pack may fail, try verify-pack
    log("index-pack failed, trying alternative approach...");
  }

  // Get all commits and find branch tips
  const refs: Record<string, string> = {};
  try {
    const output = execSync(
      "git for-each-ref --format='%(objectname) %(refname)' refs/",
      { cwd: tmpDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
    if (output) {
      for (const line of output.split("\n")) {
        const [sha, ref] = line.split(" ");
        if (sha && ref) refs[ref] = sha;
      }
    }
  } catch {
    // No refs yet — try to find the latest commit
    try {
      const sha = execSync("git rev-list --max-count=1 --all", {
        cwd: tmpDir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      if (sha) refs["refs/heads/main"] = sha;
    } catch { /* empty pack */ }
  }

  // Cleanup
  try {
    execSync(`rm -rf "${tmpDir}"`, { stdio: "pipe" });
  } catch { /* best effort */ }

  return refs;
}

async function handleFetch(sha: string, ref: string): Promise<void> {
  await ensureResolved();

  const blossomUrl = getBlossomUrl();
  if (!blossomUrl) {
    log("No Blossom URL found for this repository");
    process.stdout.write("\n");
    return;
  }

  log(`Fetching ${ref} from Blossom...`);
  const data = await downloadBlob(blossomUrl);

  // Write packfile to git's object store
  const gitDir = execSync("git rev-parse --git-dir", { encoding: "utf-8" }).trim();
  const packDir = join(gitDir, "objects", "pack");
  mkdirSync(packDir, { recursive: true });

  const packPath = join(packDir, `pack-blossom-${Date.now()}.pack`);
  writeFileSync(packPath, data);

  log("Indexing packfile...");
  try {
    execSync(`git index-pack "${packPath}"`, { stdio: "pipe" });
  } catch (err) {
    log(`Warning: index-pack issue: ${err}`);
  }

  // Update the ref
  try {
    execSync(`git update-ref "${ref}" "${sha}"`, { stdio: "pipe" });
  } catch (err) {
    log(`Warning: could not update ref ${ref}: ${err}`);
  }

  log("Fetch complete.");
}

async function handlePush(src: string, dst: string): Promise<void> {
  const keys = loadKeys();
  await ensureResolved();

  if (!resolved) {
    process.stdout.write(`error ${dst} could not resolve repository\n`);
    process.stdout.write("\n");
    return;
  }

  log(`Pushing ${src} → ${dst}...`);

  // Create packfile of all objects reachable from src
  log("Packing objects...");
  let packData: Uint8Array;
  try {
    const result = execSync(
      `git rev-list --objects --all | git pack-objects --stdout`,
      { maxBuffer: 100 * 1024 * 1024, encoding: "buffer" },
    );
    packData = new Uint8Array(result);
  } catch {
    // Fallback: pack just the pushed ref
    try {
      const result = execSync(
        `git rev-list --objects "${src}" | git pack-objects --stdout`,
        { maxBuffer: 100 * 1024 * 1024, encoding: "buffer" },
      );
      packData = new Uint8Array(result);
    } catch (err) {
      log(`Error packing objects: ${err}`);
      process.stdout.write(`error ${dst} packing failed\n`);
      process.stdout.write("\n");
      return;
    }
  }

  log(`Uploading packfile (${(packData.length / 1024).toFixed(1)} KB) to Blossom...`);
  const { url: blossomUrl } = await uploadBlob(keys.sk, packData);
  log(`Uploaded to: ${blossomUrl}`);

  // Update repo announcement with new Blossom URL
  if (repoInfo) {
    log("Updating repo announcement...");
    const updatedCloneUrls = [
      ...repoInfo.cloneUrls.filter((u) => !isBlossomUrl(u)),
      blossomUrl,
    ];
    await publishRepoAnnouncement(keys.sk, {
      ...repoInfo,
      cloneUrls: updatedCloneUrls,
    }, resolved.relays);
  }

  // Update repo state with current refs
  log("Publishing repo state...");
  const sha = execSync(`git rev-parse "${src}"`, { encoding: "utf-8" }).trim();
  const refs: Record<string, string> = {};

  // Get all local refs
  try {
    const output = execSync(
      "git for-each-ref --format='%(objectname) %(refname)' refs/heads/ refs/tags/",
      { encoding: "utf-8" },
    ).trim();
    for (const line of output.split("\n")) {
      if (!line) continue;
      const [refSha, refName] = line.split(" ");
      if (refSha && refName) refs[refName] = refSha;
    }
  } catch { /* no refs */ }

  // Ensure the pushed ref is included
  refs[dst] = sha;

  // Determine HEAD
  let head = "refs/heads/main";
  try {
    const symbolic = execSync("git symbolic-ref HEAD", { encoding: "utf-8" }).trim();
    if (symbolic) head = symbolic;
  } catch { /* detached HEAD */ }

  await publishRepoState(keys.sk, resolved.repoIdentifier, refs, head, resolved.relays);

  log("Push complete!");
  process.stdout.write(`ok ${dst}\n`);
}

// ── Main protocol loop ──

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin });
  const lines: string[] = [];
  let fetchBatch: Array<{ sha: string; ref: string }> = [];

  for await (const line of rl) {
    const trimmed = line.trim();

    if (trimmed === "") {
      // Blank line signals end of a batch
      if (fetchBatch.length > 0) {
        // Process all fetches (they all come from the same packfile)
        const first = fetchBatch[0];
        await handleFetch(first.sha, first.ref);
        fetchBatch = [];
      }
      process.stdout.write("\n");
      continue;
    }

    if (trimmed === "capabilities") {
      handleCapabilities();
      continue;
    }

    if (trimmed === "list" || trimmed === "list for-push") {
      await handleList();
      continue;
    }

    if (trimmed.startsWith("fetch ")) {
      const parts = trimmed.split(" ");
      fetchBatch.push({ sha: parts[1], ref: parts[2] });
      // Don't respond yet — wait for blank line (batch may have more fetches)
      continue;
    }

    if (trimmed.startsWith("push ")) {
      const refspec = trimmed.slice(5);
      const [src, dst] = refspec.split(":");
      if (src && dst) {
        await handlePush(src, dst);
      } else {
        log(`Invalid push refspec: ${refspec}`);
        process.stdout.write(`error ${dst || "unknown"} invalid refspec\n`);
      }
      continue;
    }

    // Unknown command
    log(`Unknown command: ${trimmed}`);
  }

  closePool();
}

main().catch((err) => {
  log(`Fatal error: ${err.message || err}`);
  process.exit(1);
});
