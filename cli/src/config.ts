import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_DIR = join(homedir(), ".nostrlab");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface Config {
  relays: string[];
  privateKey?: string; // hex nsec
}

const DEFAULT_CONFIG: Config = {
  relays: [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.nostr.band",
    "wss://relayable.org",
  ],
};

export function loadConfig(): Config {
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}
