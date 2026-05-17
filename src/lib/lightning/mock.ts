// Mock Lightning provider for local testing without real wallets.
// Generates a development-only bolt11-shaped value that settles after a short
// delay so the purchase and ticket flow can be tested end-to-end.
//
// Activated by LIGHTNING_MODE=mock in env.

import crypto from "node:crypto";

export interface MockInvoice {
  bolt11: string;
  paymentHash: string;
  preimage: string;
  paidAt: Date;
  expiresAt: Date;
}

const MOCK_SETTLE_DELAY_MS = 8_000;

interface MockEntry { paidAt: number; preimage: string }

// Survive Next.js dev-mode module reloads by living on globalThis.
const STORE_KEY = "__nostrlab_mock_store__" as const;
type GlobalWithStore = typeof globalThis & {
  [STORE_KEY]?: Map<string, MockEntry>;
};
const g = globalThis as GlobalWithStore;
if (!g[STORE_KEY]) g[STORE_KEY] = new Map();
const mockStore = g[STORE_KEY]!;

export function createMockInvoice(amountSats: number, memo: string): MockInvoice {
  const preimage = crypto.randomBytes(32).toString("hex");
  const paymentHash = crypto.createHash("sha256")
    .update(Buffer.from(preimage, "hex"))
    .digest("hex");
  const bolt11 = `lnbcMOCK${amountSats}n1${paymentHash.slice(0, 32)}`;
  const paidAt = Date.now() + MOCK_SETTLE_DELAY_MS;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  mockStore.set(paymentHash, { paidAt, preimage });
  void memo;
  return {
    bolt11,
    paymentHash,
    preimage,
    paidAt: new Date(paidAt),
    expiresAt,
  };
}

export function checkMockInvoice(paymentHash: string): {
  settled: boolean;
  preimage: string | null;
} {
  const entry = mockStore.get(paymentHash);
  if (!entry) return { settled: false, preimage: null };
  if (Date.now() >= entry.paidAt) {
    return { settled: true, preimage: entry.preimage };
  }
  return { settled: false, preimage: null };
}
