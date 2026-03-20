#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig, saveConfig } from "./config.js";
import { registerReposCommand } from "./commands/repos.js";
import { registerIssuesCommand } from "./commands/issues.js";
import { registerPatchCommand } from "./commands/patch.js";

const program = new Command();

program
  .name("nostrlab")
  .description("NostrLab CLI — interact with Nostr git repos from the terminal")
  .version("0.1.0");

// Config management
const config = program.command("config").description("Manage CLI configuration");

config
  .command("show")
  .description("Show current configuration")
  .action(() => {
    const cfg = loadConfig();
    console.log(JSON.stringify(cfg, null, 2));
  });

config
  .command("set-relays <relays...>")
  .description("Set relay URLs")
  .action((relays: string[]) => {
    const cfg = loadConfig();
    cfg.relays = relays;
    saveConfig(cfg);
    console.log(`Relays updated: ${relays.join(", ")}`);
  });

config
  .command("add-relay <relay>")
  .description("Add a relay URL")
  .action((relay: string) => {
    const cfg = loadConfig();
    if (cfg.relays.includes(relay)) {
      console.log("Relay already configured.");
      return;
    }
    cfg.relays.push(relay);
    saveConfig(cfg);
    console.log(`Added relay: ${relay}`);
  });

// Register subcommands
registerReposCommand(program);
registerIssuesCommand(program);
registerPatchCommand(program);

program.parse();
