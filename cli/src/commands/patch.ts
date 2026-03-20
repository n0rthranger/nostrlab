import type { Command } from "commander";
import { loadConfig } from "../config.js";
import { queryEvents, shortenKey } from "../nostr.js";
import { nip19 } from "nostr-tools";

export function registerPatchCommand(program: Command) {
  const patch = program.command("patches").description("Browse repository patches/PRs");

  patch
    .command("list <repo-naddr>")
    .description("List patches for a repository")
    .option("-s, --status <status>", "Filter by status (open/merged/closed)", "open")
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

      console.log("Fetching patches...\n");
      const events = await queryEvents(config.relays, [
        {
          kinds: [1617],
          "#a": [repoCoord!],
          limit: parseInt(opts.limit),
        },
      ]);

      if (events.length === 0) {
        console.log("No patches found.");
        process.exit(0);
      }

      const filtered = opts.status === "all"
        ? events
        : events.filter((ev) => {
            const status = ev.tags.find((t) => t[0] === "status")?.[1] ?? "open";
            return status === opts.status;
          });

      for (const ev of filtered) {
        const title = ev.tags.find((t) => t[0] === "subject")?.[1] || ev.content.slice(0, 80);
        const status = ev.tags.find((t) => t[0] === "status")?.[1] || "open";
        const label = status === "open" ? "[OPEN]" : status === "merged" ? "[MERGED]" : "[CLOSED]";
        console.log(`  ${label} ${title}`);
        console.log(`    by ${shortenKey(ev.pubkey)} • ${new Date(ev.created_at * 1000).toLocaleDateString()}`);
        console.log();
      }
      console.log(`${filtered.length} patches.`);
      process.exit(0);
    });

  patch
    .command("show <event-id>")
    .description("Show a patch diff")
    .action(async (eventId) => {
      const config = loadConfig();
      let id = eventId;
      if (eventId.startsWith("note")) {
        const decoded = nip19.decode(eventId) as { type: string; data: any };
        if (decoded.type === "note") id = decoded.data;
      }

      const events = await queryEvents(config.relays, [{ ids: [id] }]);
      if (events.length === 0) {
        console.error("Patch not found.");
        process.exit(1);
      }

      const ev = events[0];
      const title = ev.tags.find((t) => t[0] === "subject")?.[1];
      if (title) console.log(`Subject: ${title}`);
      console.log(`Author: ${shortenKey(ev.pubkey)}`);
      console.log(`Date: ${new Date(ev.created_at * 1000).toISOString()}`);
      console.log("---");
      console.log(ev.content);
      process.exit(0);
    });
}
