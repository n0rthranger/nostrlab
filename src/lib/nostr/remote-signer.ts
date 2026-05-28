"use client";

import { SimplePool } from "nostr-tools/pool";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  BunkerSigner,
  createNostrConnectURI,
  parseBunkerInput,
  type BunkerPointer,
} from "nostr-tools/nip46";
import { getClientRelays } from "./relays";

export interface RemoteSignerStorage {
  clientSecretKey: string;
  bunkerPointer: BunkerPointer;
  userPubkey: string;
}

export interface NostrConnectChallenge {
  clientSecretKey: string;
  clientPubkey: string;
  secret: string;
  relays: string[];
  uri: string;
}

const DEFAULT_PERMS = [
  "get_public_key",
  "sign_event:27235",
  "sign_event:31923",
  "sign_event:31925",
  "sign_event:31926",
  "sign_event:31924",
  "sign_event:34550",
];

let pool: SimplePool | null = null;

function getPool() {
  if (!pool) pool = new SimplePool({ enablePing: true, enableReconnect: true });
  return pool;
}

export function closeRemoteSignerPool() {
  pool?.destroy();
  pool = null;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error("invalid hex key");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function randomSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function createNostrConnectChallenge(): NostrConnectChallenge {
  const secretKey = generateSecretKey();
  const clientPubkey = getPublicKey(secretKey);
  const relays = getClientRelays();
  const secret = randomSecret();
  const uri = createNostrConnectURI({
    clientPubkey,
    relays,
    secret,
    perms: DEFAULT_PERMS,
    name: "NostrLab",
    url: typeof window !== "undefined" ? window.location.origin : undefined,
  });
  return {
    clientSecretKey: bytesToHex(secretKey),
    clientPubkey,
    relays,
    secret,
    uri,
  };
}

export async function connectWithNostrConnect(
  challenge: NostrConnectChallenge,
  signal?: AbortSignal
): Promise<{ signer: BunkerSigner; storage: RemoteSignerStorage }> {
  const signer = await BunkerSigner.fromURI(
    hexToBytes(challenge.clientSecretKey),
    challenge.uri,
    { pool: getPool(), onauth: (url) => window.open(url, "_blank", "noopener,noreferrer") },
    signal ?? 120_000
  );
  const userPubkey = await signer.getPublicKey();
  return {
    signer,
    storage: {
      clientSecretKey: challenge.clientSecretKey,
      bunkerPointer: signer.bp,
      userPubkey,
    },
  };
}

export async function connectWithBunkerInput(
  input: string
): Promise<{ signer: BunkerSigner; storage: RemoteSignerStorage }> {
  const bp = await parseBunkerInput(input.trim());
  if (!bp) throw new Error("Enter a valid bunker:// token.");
  const clientSecretKey = generateSecretKey();
  const signer = BunkerSigner.fromBunker(clientSecretKey, bp, {
    pool: getPool(),
    onauth: (url) => window.open(url, "_blank", "noopener,noreferrer"),
  });
  await signer.connect();
  const userPubkey = await signer.getPublicKey();
  return {
    signer,
    storage: {
      clientSecretKey: bytesToHex(clientSecretKey),
      bunkerPointer: signer.bp,
      userPubkey,
    },
  };
}

export function signerFromStorage(storage: RemoteSignerStorage): BunkerSigner {
  return BunkerSigner.fromBunker(hexToBytes(storage.clientSecretKey), storage.bunkerPointer, {
    pool: getPool(),
    onauth: (url) => window.open(url, "_blank", "noopener,noreferrer"),
  });
}
