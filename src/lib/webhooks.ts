import { type Event } from "nostr-tools";

export interface WebhookConfig {
  id: string;
  url: string;
  events: string[]; // "issues", "patches", "prs", "comments"
  enabled: boolean;
  secret?: string;
}

const STORAGE_PREFIX = "nostrlab-webhooks-";

export function getWebhooks(repoAddress: string): WebhookConfig[] {
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + repoAddress);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveWebhooks(repoAddress: string, webhooks: WebhookConfig[]): void {
  localStorage.setItem(STORAGE_PREFIX + repoAddress, JSON.stringify(webhooks));
}

function isValidWebhookUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const hostname = url.hostname.toLowerCase();
    // Block localhost and loopback
    if (hostname === "localhost" || hostname === "[::1]") return false;
    if (/^127\./.test(hostname)) return false; // Full 127.0.0.0/8
    // Block private/reserved networks
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.)/.test(hostname)) return false;
    // Block IPv6 private/link-local
    if (/^\[?(fe80|fc|fd|::1|::ffff:127)/i.test(hostname)) return false;
    // Block cloud metadata endpoints
    if (hostname === "169.254.169.254" || hostname === "metadata.google.internal") return false;
    // Block internal hostnames
    if (hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".localhost")) return false;
    // Block multicast
    if (/^(22[4-9]|23\d|24\d|25[0-5])\./.test(hostname)) return false;
    // Must have a dot (no bare hostnames)
    if (!hostname.includes(".") && !hostname.startsWith("[")) return false;
    return true;
  } catch {
    return false;
  }
}

export async function triggerWebhook(
  webhook: WebhookConfig,
  payload: {
    type: string;
    repoAddress: string;
    event: Event;
    timestamp: number;
  },
): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!isValidWebhookUrl(webhook.url)) {
    return { ok: false, error: "Invalid or blocked webhook URL" };
  }
  try {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (webhook.secret) {
      // Simple HMAC-like signature using the secret
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(webhook.secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
      const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
      headers["X-NostrLab-Signature"] = `sha256=${hex}`;
    }

    const res = await fetch(webhook.url, {
      method: "POST",
      headers,
      body,
    });
    return { ok: res.ok, status: res.status };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export function triggerMatchingWebhooks(
  repoAddress: string,
  eventType: string,
  event: Event,
): void {
  const webhooks = getWebhooks(repoAddress);
  const matching = webhooks.filter((w) => w.enabled && w.events.includes(eventType));
  const payload = {
    type: eventType,
    repoAddress,
    event,
    timestamp: Math.floor(Date.now() / 1000),
  };
  for (const w of matching) {
    triggerWebhook(w, payload).catch(() => {});
  }
}
