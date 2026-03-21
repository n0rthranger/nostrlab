/**
 * Load the user's Nostr secret key for signing.
 * Priority: NOSTR_NSEC env var → ~/.nostrlab/config.json → ~/.nostr/nsec
 */
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { nip19, getPublicKey } from "nostr-tools";

export interface KeyPair {
  sk: Uint8Array;
  pk: string;
}

export function loadKeys(): KeyPair {
  // 1. Environment variable
  const envNsec = process.env.NOSTR_NSEC;
  if (envNsec) {
    return decodeNsec(envNsec.trim());
  }

  // 2. NostrLab CLI config
  try {
    const configPath = join(homedir(), ".nostrlab", "config.json");
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    if (raw.privateKey) {
      return decodeNsec(raw.privateKey);
    }
  } catch { /* not found */ }

  // 3. ~/.nostr/nsec file
  try {
    const nsecPath = join(homedir(), ".nostr", "nsec");
    const nsec = readFileSync(nsecPath, "utf-8").trim();
    return decodeNsec(nsec);
  } catch { /* not found */ }

  throw new Error(
    "No Nostr key found. Set one of:\n" +
    "  - NOSTR_NSEC environment variable\n" +
    "  - privateKey in ~/.nostrlab/config.json\n" +
    "  - nsec in ~/.nostr/nsec"
  );
}

function decodeNsec(input: string): KeyPair {
  try {
    if (input.startsWith("nsec1")) {
      const decoded = nip19.decode(input);
      if (decoded.type !== "nsec") throw new Error("Not an nsec");
      const sk = decoded.data as Uint8Array;
      return { sk, pk: getPublicKey(sk) };
    }
    // Assume hex
    const sk = hexToBytes(input);
    return { sk, pk: getPublicKey(sk) };
  } catch {
    throw new Error("Invalid Nostr key format. Provide an nsec or hex private key.");
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
