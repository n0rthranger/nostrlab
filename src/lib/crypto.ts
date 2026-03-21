/**
 * Symmetric encryption for private repo files.
 * Uses AES-GCM with a random 256-bit key.
 * The key is shared with authorized users via NIP-04 encrypted DMs.
 */

export async function generateRepoKey(): Promise<string> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(key);
}

export async function encryptContent(content: string, hexKey: string): Promise<string> {
  const key = await importKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(content);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  // Format: iv(hex):ciphertext(hex)
  return bytesToHex(iv) + ":" + bytesToHex(new Uint8Array(encrypted));
}

export async function decryptContent(encrypted: string, hexKey: string): Promise<string> {
  const [ivHex, cipherHex] = encrypted.split(":");
  if (!ivHex || !cipherHex) throw new Error("Invalid encrypted format");
  const key = await importKey(hexKey);
  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(cipherHex);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  );
  return new TextDecoder().decode(decrypted);
}

async function importKey(hexKey: string): Promise<CryptoKey> {
  const raw = hexToBytes(hexKey);
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
