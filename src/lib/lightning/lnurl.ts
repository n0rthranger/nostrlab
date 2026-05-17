// LNURL-pay client — resolves a Lightning Address (lud16) to a payRequest
// endpoint, requests an invoice from it, and polls the LUD-21 verify URL to
// confirm settlement.
//
// Flow:
//   1. resolveLud16("alice@example.com") → metadata response with `callback`
//   2. requestInvoice(callback, msats) → { pr, verify } — bolt11 + verify URL
//   3. (buyer pays the bolt11)
//   4. verifyInvoice(verifyUrl) → { settled: true, preimage } when paid
//
// Sats settle directly to the organizer's wallet — we never see them.

import { decode as decodeBolt11 } from "light-bolt11-decoder";
import net from "node:net";
import dns from "node:dns/promises";

export interface LnurlPayMetadata {
  callback: string;
  minSendable: number; // millisats
  maxSendable: number;
  metadata: string;
  tag: "payRequest";
  commentAllowed?: number;
  allowsNostr?: boolean;
  nostrPubkey?: string;
}

export interface LnurlInvoice {
  bolt11: string;
  verifyUrl: string | null; // null if LUD-21 not supported
  paymentHash: string;
}

export interface LnurlVerify {
  settled: boolean;
  preimage: string | null;
  paymentHash?: string;
}

const FETCH_TIMEOUT_MS = 6000;

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const parts = host.split(".").map(Number);
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (ipVersion === 6) {
    return (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80:")
    );
  }
  return false;
}

function assertSafeHttpsUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("URL must use https");
  if (url.username || url.password) throw new Error("URL must not include credentials");
  if (isBlockedHostname(url.hostname)) throw new Error("URL host is not allowed");
  return url;
}

async function assertPublicResolution(url: URL): Promise<void> {
  if (net.isIP(url.hostname.replace(/^\[/, "").replace(/\]$/, ""))) return;
  const records = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (records.length === 0 || records.some((r) => isBlockedHostname(r.address))) {
    throw new Error("URL resolves to a blocked network");
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const safeUrl = assertSafeHttpsUrl(url);
  await assertPublicResolution(safeUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(safeUrl.toString(), {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      throw new Error("redirects are not allowed");
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Convert lud16 to LNURL-pay endpoint URL (LUD-16 spec). */
function lud16ToEndpoint(lud16: string): string {
  const at = lud16.lastIndexOf("@");
  if (at <= 0) throw new Error("Invalid Lightning Address");
  const local = lud16.slice(0, at);
  const domain = lud16.slice(at + 1).toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(domain)) throw new Error("Invalid LN address domain");
  if (!/^[A-Za-z0-9._-]+$/.test(local)) throw new Error("Invalid LN address local part");
  if (isBlockedHostname(domain)) throw new Error("LN address domain is not allowed");
  // Local Tor / dev addresses use plain http, but the spec mandates https.
  return `https://${domain}/.well-known/lnurlp/${local}`;
}

/** Hit the lud16 endpoint, return the payRequest metadata. */
export async function resolveLud16(lud16: string): Promise<LnurlPayMetadata> {
  const endpoint = lud16ToEndpoint(lud16);
  const meta = await fetchJson<LnurlPayMetadata & { status?: string; reason?: string }>(endpoint);
  if (meta.status === "ERROR") throw new Error(meta.reason ?? "LNURL endpoint error");
  if (meta.tag !== "payRequest") throw new Error("Endpoint is not a payRequest");
  if (!meta.callback) throw new Error("Endpoint missing callback");
  assertSafeHttpsUrl(meta.callback);
  return meta;
}

/** Request an invoice from the callback URL for `msats`. */
export async function requestInvoice(
  callback: string,
  amountMsat: number,
  comment?: string
): Promise<LnurlInvoice> {
  const url = assertSafeHttpsUrl(callback);
  url.searchParams.set("amount", String(amountMsat));
  if (comment) url.searchParams.set("comment", comment.slice(0, 144));

  const resp = await fetchJson<{
    pr: string;
    verify?: string;
    routes?: unknown;
    status?: string;
    reason?: string;
  }>(url.toString());

  if (resp.status === "ERROR") throw new Error(resp.reason ?? "Invoice request failed");
  if (!resp.pr) throw new Error("No bolt11 in callback response");

  const paymentHash = extractPaymentHash(resp.pr);
  if (resp.verify) assertSafeHttpsUrl(resp.verify);
  return {
    bolt11: resp.pr,
    verifyUrl: resp.verify ?? null,
    paymentHash,
  };
}

/** Poll the LUD-21 verify URL. */
export async function verifyInvoice(verifyUrl: string): Promise<LnurlVerify> {
  const resp = await fetchJson<{
    status: string;
    settled: boolean;
    preimage?: string | null;
    pr?: string;
  }>(verifyUrl);
  if (resp.status === "ERROR") throw new Error("verify endpoint error");
  return {
    settled: !!resp.settled,
    preimage: resp.preimage ?? null,
  };
}

/** Pull the payment hash out of a bolt11. Throws if malformed. */
function extractPaymentHash(bolt11: string): string {
  const decoded = decodeBolt11(bolt11);
  const sec = decoded.sections.find((s) => s.name === "payment_hash");
  if (!sec || !("value" in sec) || typeof sec.value !== "string") {
    throw new Error("bolt11 missing payment_hash");
  }
  return sec.value.toLowerCase();
}

/** Pull the expiry (seconds since invoice creation) out of a bolt11. */
export function extractExpirySec(bolt11: string): number {
  const decoded = decodeBolt11(bolt11);
  const sec = decoded.sections.find((s) => s.name === "expiry");
  if (sec && "value" in sec && typeof sec.value === "number") return sec.value;
  return 3600;
}
