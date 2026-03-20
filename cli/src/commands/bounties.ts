import type { Command } from "commander";
import { loadConfig } from "../config.js";
import { queryEvents, shortenKey } from "../nostr.js";

export function registerBountiesCommand(program: Command) {
  const bounties = program.command("bounties").description("Browse bounties across all repositories");

  bounties
    .command("list")
    .description("List open bounties across all repos")
    .option("-s, --status <status>", "Filter by status (open/claimed/paid/all)", "open")
    .option("-l, --limit <n>", "Max results", "30")
    .option("--sort <sort>", "Sort by (amount/recent)", "amount")
    .action(async (opts) => {
      const config = loadConfig();

      console.log("Fetching bounties...\n");
      const events = await queryEvents(config.relays, [
        { kinds: [1623], limit: parseInt(opts.limit) * 2 },
      ]);

      if (events.length === 0) {
        console.log("No bounties found.");
        process.exit(0);
      }

      let parsed = events.map((e) => {
        const repoAddr = e.tags.find((t) => t[0] === "a")?.[1] ?? "";
        const parts = repoAddr.split(":");
        return {
          id: e.id,
          pubkey: e.pubkey,
          content: e.content,
          repoIdentifier: parts[2] ?? "unknown",
          amount: parseInt(e.tags.find((t) => t[0] === "amount")?.[1] ?? "0", 10),
          status: e.tags.find((t) => t[0] === "status")?.[1] ?? "open",
          createdAt: e.created_at,
        };
      });

      if (opts.status !== "all") {
        parsed = parsed.filter((b) => b.status === opts.status);
      }

      if (opts.sort === "amount") {
        parsed.sort((a, b) => b.amount - a.amount);
      } else {
        parsed.sort((a, b) => b.createdAt - a.createdAt);
      }

      parsed = parsed.slice(0, parseInt(opts.limit));

      if (parsed.length === 0) {
        console.log(`No ${opts.status} bounties found.`);
        process.exit(0);
      }

      let totalSats = 0;
      for (const b of parsed) {
        const statusLabel = b.status === "open" ? "\x1b[32m[OPEN]\x1b[0m" : b.status === "paid" ? "\x1b[35m[PAID]\x1b[0m" : "\x1b[33m[CLAIMED]\x1b[0m";
        console.log(`  ${statusLabel} \x1b[33m⚡ ${b.amount.toLocaleString()} sats\x1b[0m — ${b.content || "(no description)"}`);
        console.log(`    repo: ${b.repoIdentifier} • by ${shortenKey(b.pubkey)} • ${new Date(b.createdAt * 1000).toLocaleDateString()}`);
        console.log();
        if (b.status === "open") totalSats += b.amount;
      }
      console.log(`${parsed.length} bounties. ${totalSats.toLocaleString()} sats available.`);
      process.exit(0);
    });
}
