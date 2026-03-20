import type { Command } from "commander";
import { loadConfig, saveConfig } from "../config.js";
import { pool, shortenKey } from "../nostr.js";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { nip19, finalizeEvent, getPublicKey } from "nostr-tools";

function collectFiles(dir: string, base: string = dir): { path: string; content: string }[] {
  const entries: { path: string; content: string }[] = [];
  const items = readdirSync(dir);

  for (const item of items) {
    // Skip hidden files, node_modules, .git, dist, build
    if (item.startsWith(".") || item === "node_modules" || item === "dist" || item === "build") continue;

    const fullPath = join(dir, item);
    const st = statSync(fullPath);

    if (st.isDirectory()) {
      entries.push(...collectFiles(fullPath, base));
    } else if (st.isFile() && st.size < 500_000) {
      // Skip files larger than 500KB
      try {
        const content = readFileSync(fullPath, "utf-8");
        const relPath = relative(base, fullPath);
        entries.push({ path: relPath, content });
      } catch {
        // Skip binary files that can't be read as UTF-8
      }
    }
  }
  return entries;
}

export function registerPublishCommand(program: Command) {
  program
    .command("publish")
    .description("Publish current directory as a Nostr repo (creates announcement + file blobs)")
    .option("-n, --name <name>", "Repository name")
    .option("-d, --description <desc>", "Repository description", "")
    .option("-t, --tags <tags>", "Comma-separated tags", "")
    .option("--dir <path>", "Directory to publish", ".")
    .action(async (opts) => {
      const config = loadConfig();

      if (!config.privateKey) {
        console.error("No private key configured. Run: nostrlab config set-key <nsec>");
        console.error("Your key is stored locally at ~/.nostrlab/config.json");
        process.exit(1);
      }

      let sk: Uint8Array;
      try {
        if (config.privateKey.startsWith("nsec")) {
          const decoded = nip19.decode(config.privateKey) as { type: string; data: Uint8Array };
          sk = decoded.data;
        } else {
          sk = Buffer.from(config.privateKey, "hex") as unknown as Uint8Array;
        }
      } catch {
        console.error("Invalid private key in config.");
        process.exit(1);
      }

      const pubkey = getPublicKey(sk);
      const name = opts.name || process.cwd().split("/").pop() || "unnamed";
      const identifier = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
      const tags = opts.tags ? opts.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [];

      console.log(`Publishing "${name}" as ${shortenKey(pubkey)}...`);
      console.log(`Identifier: ${identifier}\n`);

      // Collect files
      const dir = opts.dir === "." ? process.cwd() : opts.dir;
      console.log("Collecting files...");
      const files = collectFiles(dir);
      console.log(`Found ${files.length} files.\n`);

      if (files.length === 0) {
        console.error("No files found to publish.");
        process.exit(1);
      }

      // Publish repo announcement (kind 30617)
      const repoTags: string[][] = [
        ["d", identifier],
        ["name", name],
        ["description", opts.description],
      ];
      for (const t of tags) repoTags.push(["t", t]);

      const repoEvent = finalizeEvent({
        kind: 30617,
        content: "",
        tags: repoTags,
        created_at: Math.floor(Date.now() / 1000),
      }, sk);

      console.log("Publishing repo announcement...");
      await Promise.allSettled(pool.publish(config.relays, repoEvent as any));
      console.log("  Done.\n");

      // Publish file blobs (kind 31617)
      const repoAddr = `30617:${pubkey}:${identifier}`;
      let published = 0;
      for (const file of files) {
        const fileEvent = finalizeEvent({
          kind: 31617,
          content: file.content,
          tags: [
            ["d", `${identifier}/${file.path}`],
            ["a", repoAddr],
            ["path", file.path],
            ["branch", "main"],
          ],
          created_at: Math.floor(Date.now() / 1000),
        }, sk);

        await Promise.allSettled(pool.publish(config.relays, fileEvent as any));
        published++;
        process.stdout.write(`\r  Publishing files... ${published}/${files.length}`);
      }

      console.log(`\n\nPublished ${published} files to ${config.relays.length} relays.`);
      const npub = nip19.npubEncode(pubkey);
      console.log(`\nView at: https://nostrlab.com/repo/${pubkey}/${identifier}`);
      process.exit(0);
    });

  // Config command to set private key
  const configCmd = program.commands.find((c) => c.name() === "config");
  if (configCmd) {
    configCmd
      .command("set-key <nsec>")
      .description("Set your private key (nsec or hex)")
      .action((key: string) => {
        const config = loadConfig();
        config.privateKey = key;
        saveConfig(config);
        console.log("Private key saved to ~/.nostrlab/config.json");
      });
  }
}
