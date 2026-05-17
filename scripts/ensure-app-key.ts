// Ensures NOSTRLAB_APP_NSEC + NEXT_PUBLIC_NOSTRLAB_APP_PUBKEY exist in .env.
// Generates the keypair on first run; idempotent on subsequent runs.
//
// Run via `pnpm app:keygen` or implicitly before `pnpm dev`.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";

const ENV_PATH = resolve(process.cwd(), ".env");

function read(): string {
  if (!existsSync(ENV_PATH)) return "";
  return readFileSync(ENV_PATH, "utf8");
}

function hasKey(env: string, key: string): boolean {
  return new RegExp(`^${key}\\s*=.+`, "m").test(env);
}

function appendKv(env: string, kv: Record<string, string>): string {
  const lines = Object.entries(kv).map(([k, v]) => `${k}="${v}"`);
  const trailing = env.endsWith("\n") || env === "" ? "" : "\n";
  return env + trailing + "\n# NostrLab app identity (NIP-89). Generated automatically.\n" + lines.join("\n") + "\n";
}

function main() {
  const env = read();

  if (hasKey(env, "NOSTRLAB_APP_NSEC") && hasKey(env, "NEXT_PUBLIC_NOSTRLAB_APP_PUBKEY")) {
    console.log("[app-key] already present — nothing to do");
    return;
  }

  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const nsec = nip19.nsecEncode(sk);
  const npub = nip19.npubEncode(pk);

  const next = appendKv(env, {
    NOSTRLAB_APP_NSEC: nsec,
    NEXT_PUBLIC_NOSTRLAB_APP_PUBKEY: pk,
  });
  writeFileSync(ENV_PATH, next, { mode: 0o600 });

  console.log("[app-key] created NostrLab app identity:");
  console.log(`  npub: ${npub}`);
  console.log(`  pubkey (hex): ${pk}`);
  console.log("  Stored in .env. Reveal nsec only if you intend to publish the kind:31990 app descriptor manually.");
}

main();
