import type { Command } from "commander";
import { loadConfig } from "../config.js";
import { queryEvents, parseRepo } from "../nostr.js";
import { nip19 } from "nostr-tools";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";

export function registerCloneCommand(program: Command) {
  program
    .command("clone <repo-ref>")
    .description("Download a Nostr repo's files locally (naddr, pubkey/identifier, or URL)")
    .option("-o, --output <dir>", "Output directory")
    .action(async (repoRef: string, opts) => {
      const config = loadConfig();
      let pubkey: string;
      let identifier: string;

      // Parse repo reference
      if (repoRef.includes("nostrlab.com/repo/")) {
        // URL format: nostrlab.com/repo/<pubkey>/<identifier>
        const parts = repoRef.split("/repo/")[1]?.split("/");
        if (!parts || parts.length < 2) {
          console.error("Invalid URL format. Expected: .../repo/<pubkey>/<identifier>");
          process.exit(1);
        }
        pubkey = parts[0];
        identifier = parts[1];
      } else if (repoRef.startsWith("naddr")) {
        try {
          const decoded = nip19.decode(repoRef) as { type: string; data: any };
          if (decoded.type === "naddr") {
            pubkey = decoded.data.pubkey;
            identifier = decoded.data.identifier;
          } else {
            console.error("Expected an naddr.");
            process.exit(1);
          }
        } catch {
          console.error("Invalid naddr.");
          process.exit(1);
        }
      } else if (repoRef.includes("/")) {
        const [pubkeyOrNpub, id] = repoRef.split("/");
        identifier = id;
        if (pubkeyOrNpub.startsWith("npub")) {
          const decoded = nip19.decode(pubkeyOrNpub) as { type: string; data: any };
          if (decoded.type === "npub") pubkey = decoded.data;
          else { console.error("Invalid npub."); process.exit(1); }
        } else {
          pubkey = pubkeyOrNpub;
        }
      } else {
        console.error("Provide repo as naddr, pubkey/identifier, or NostrLab URL.");
        process.exit(1);
      }

      const repoCoord = `30617:${pubkey!}:${identifier!}`;
      const outputDir = opts.output || identifier!;

      // Fetch repo info
      console.log("Fetching repo info...");
      const repoEvents = await queryEvents(config.relays, [
        { kinds: [30617], authors: [pubkey!], "#d": [identifier!], limit: 1 },
      ]);

      if (repoEvents.length > 0) {
        const repo = parseRepo(repoEvents[0]);
        console.log(`  ${repo.name} — ${repo.description || "(no description)"}`);
        if (repo.cloneUrls.length > 0) {
          console.log(`  git clone URL: ${repo.cloneUrls[0]}`);
        }
      }

      // Fetch file blobs (kind 31617)
      console.log("\nFetching files...");
      const fileEvents = await queryEvents(config.relays, [
        { kinds: [31617], "#a": [repoCoord], limit: 500 },
      ], 15000);

      if (fileEvents.length === 0) {
        console.log("No file blobs found for this repo.");
        console.log("The repo may use git clone URLs instead of Nostr file blobs.");
        if (repoEvents.length > 0) {
          const repo = parseRepo(repoEvents[0]);
          if (repo.cloneUrls.length > 0) {
            console.log(`\nTry: git clone ${repo.cloneUrls[0]}`);
          }
        }
        process.exit(0);
      }

      // Deduplicate by path (keep latest)
      const byPath = new Map<string, { path: string; content: string }>();
      for (const ev of fileEvents) {
        const path = ev.tags.find((t) => t[0] === "path")?.[1] ??
          ev.tags.find((t) => t[0] === "d")?.[1]?.replace(`${identifier!}/`, "") ?? "";
        if (!path) continue;
        const existing = byPath.get(path);
        if (!existing) {
          byPath.set(path, { path, content: ev.content });
        }
      }

      // Write files
      console.log(`Found ${byPath.size} files. Writing to ./${outputDir}/\n`);
      mkdirSync(outputDir, { recursive: true });

      let written = 0;
      for (const [, file] of byPath) {
        const filePath = join(outputDir, file.path);
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, file.content, "utf-8");
        written++;
        console.log(`  ${file.path}`);
      }

      console.log(`\nCloned ${written} files to ./${outputDir}/`);
      process.exit(0);
    });
}
