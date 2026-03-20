import type { Command } from "commander";
import { loadConfig } from "../config.js";
import { queryEvents, parseIssue, shortenKey } from "../nostr.js";
import { nip19 } from "nostr-tools";

export function registerIssuesCommand(program: Command) {
  const issues = program.command("issues").description("Browse repository issues");

  issues
    .command("list <repo-naddr>")
    .description("List issues for a repository (use naddr or pubkey/identifier)")
    .option("-s, --status <status>", "Filter by status (open/closed)", "open")
    .option("-l, --limit <n>", "Max results", "30")
    .action(async (repoRef, opts) => {
      const config = loadConfig();
      let repoCoord: string;

      if (repoRef.startsWith("naddr")) {
        try {
          const decoded = nip19.decode(repoRef) as { type: string; data: any };
          if (decoded.type === "naddr") {
            repoCoord = `30617:${decoded.data.pubkey}:${decoded.data.identifier}`;
          } else {
            console.error("Expected an naddr.");
            process.exit(1);
          }
        } catch {
          console.error("Invalid naddr.");
          process.exit(1);
        }
      } else if (repoRef.includes("/")) {
        const [pubkeyOrNpub, identifier] = repoRef.split("/");
        let pubkey = pubkeyOrNpub;
        if (pubkeyOrNpub.startsWith("npub")) {
          const decoded = nip19.decode(pubkeyOrNpub) as { type: string; data: any };
          if (decoded.type === "npub") pubkey = decoded.data;
        }
        repoCoord = `30617:${pubkey}:${identifier}`;
      } else {
        console.error("Provide repo as naddr or pubkey/identifier.");
        process.exit(1);
      }

      console.log("Fetching issues...\n");
      const events = await queryEvents(config.relays, [
        {
          kinds: [1621],
          "#a": [repoCoord!],
          limit: parseInt(opts.limit),
        },
      ]);

      const issues = events.map(parseIssue);
      const filtered = opts.status === "all"
        ? issues
        : issues.filter((i) => i.status === opts.status);

      if (filtered.length === 0) {
        console.log(`No ${opts.status} issues found.`);
        process.exit(0);
      }

      for (const issue of filtered) {
        const status = issue.status === "open" ? "[OPEN]" : "[CLOSED]";
        console.log(`  ${status} ${issue.title}`);
        console.log(`    by ${shortenKey(issue.pubkey)} • ${new Date(issue.createdAt * 1000).toLocaleDateString()}`);
        console.log();
      }
      console.log(`${filtered.length} issues.`);
      process.exit(0);
    });
}
