import type { Command } from "commander";
import { loadConfig } from "../config.js";
import { queryEvents, parseRepo, shortenKey } from "../nostr.js";
import { nip19 } from "nostr-tools";

export function registerReposCommand(program: Command) {
  const repos = program.command("repos").description("Browse and search repositories");

  repos
    .command("list")
    .description("List recent repositories")
    .option("-l, --limit <n>", "Max results", "20")
    .option("-t, --tag <tag>", "Filter by tag")
    .action(async (opts) => {
      const config = loadConfig();
      const filter: Record<string, unknown> = {
        kinds: [30617],
        limit: parseInt(opts.limit),
      };
      if (opts.tag) {
        filter["#t"] = [opts.tag];
      }

      console.log("Fetching repositories...\n");
      const events = await queryEvents(config.relays, [filter]);

      if (events.length === 0) {
        console.log("No repositories found.");
        return;
      }

      for (const ev of events) {
        const repo = parseRepo(ev);
        const npub = nip19.npubEncode(repo.pubkey);
        console.log(`  ${repo.name}`);
        console.log(`    by ${shortenKey(repo.pubkey)}`);
        if (repo.description) console.log(`    ${repo.description}`);
        if (repo.tags.length) console.log(`    tags: ${repo.tags.join(", ")}`);
        if (repo.cloneUrls.length) console.log(`    clone: ${repo.cloneUrls[0]}`);
        console.log(`    url: https://nostrlab.com/repo/${npub}/${repo.identifier}`);
        console.log();
      }
      console.log(`${events.length} repositories found.`);
      process.exit(0);
    });

  repos
    .command("search <query>")
    .description("Search repositories by name")
    .option("-l, --limit <n>", "Max results", "20")
    .action(async (query, opts) => {
      const config = loadConfig();
      const events = await queryEvents(config.relays, [
        { kinds: [30617], limit: parseInt(opts.limit) * 3 },
      ]);

      const q = query.toLowerCase();
      const matches = events
        .map((ev) => parseRepo(ev))
        .filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.description.toLowerCase().includes(q) ||
            r.tags.some((t) => t.toLowerCase().includes(q)),
        )
        .slice(0, parseInt(opts.limit));

      if (matches.length === 0) {
        console.log(`No repositories matching "${query}".`);
        process.exit(0);
      }

      for (const repo of matches) {
        console.log(`  ${repo.name} — ${repo.description || "(no description)"}`);
        if (repo.cloneUrls.length) console.log(`    clone: ${repo.cloneUrls[0]}`);
        console.log();
      }
      console.log(`${matches.length} results.`);
      process.exit(0);
    });
}
