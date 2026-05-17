// Lightning settlement controller. NostrLab never custodies sats — invoices
// are issued by the organizer's own wallet (via their lud16) and paid
// directly into it. This module decides which path to take based on env.

export type LightningMode = "lnurl" | "mock" | "none";

export function getLightningMode(): LightningMode {
  const raw = (process.env.LIGHTNING_MODE ?? "lnurl").toLowerCase();
  if (raw === "lnurl" || raw === "mock" || raw === "none") return raw;
  throw new Error(`Unknown LIGHTNING_MODE: ${raw} (expected lnurl|mock|none)`);
}

export {
  resolveLud16,
  requestInvoice,
  verifyInvoice,
  extractExpirySec,
} from "./lnurl";

export { createMockInvoice, checkMockInvoice } from "./mock";
