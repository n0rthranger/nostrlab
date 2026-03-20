import { useState } from "react";
import { getWebhooks, saveWebhooks, triggerWebhook } from "../lib/webhooks";
import type { WebhookConfig } from "../lib/webhooks";
import { useToast } from "./Toast";

interface Props {
  repoAddress: string;
}

const EVENT_TYPES = [
  { id: "issues", label: "Issues" },
  { id: "patches", label: "Patches" },
  { id: "prs", label: "Pull Requests" },
  { id: "comments", label: "Comments" },
  { id: "file_push", label: "File Push" },
];

export default function WebhookSettings({ repoAddress }: Props) {
  const { toast } = useToast();
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>(() => getWebhooks(repoAddress));
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>(["issues", "patches", "prs", "comments"]);
  const [newSecret, setNewSecret] = useState("");
  const [testing, setTesting] = useState<string | null>(null);

  const save = (updated: WebhookConfig[]) => {
    setWebhooks(updated);
    saveWebhooks(repoAddress, updated);
  };

  const addWebhook = () => {
    const url = newUrl.trim();
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        toast("Webhook URL must use HTTP or HTTPS", "error");
        return;
      }
    } catch {
      toast("Invalid URL", "error");
      return;
    }
    const webhook: WebhookConfig = {
      id: Date.now().toString(36),
      url,
      events: newEvents,
      enabled: true,
      secret: newSecret.trim() || undefined,
    };
    save([...webhooks, webhook]);
    setNewUrl("");
    setNewSecret("");
    toast("Webhook added", "success");
  };

  const removeWebhook = (id: string) => {
    save(webhooks.filter((w) => w.id !== id));
  };

  const toggleWebhook = (id: string) => {
    save(webhooks.map((w) => w.id === id ? { ...w, enabled: !w.enabled } : w));
  };

  const testWebhook = async (webhook: WebhookConfig) => {
    setTesting(webhook.id);
    const result = await triggerWebhook(webhook, {
      type: "test",
      repoAddress,
      event: { id: "test", kind: 0, content: "NostrLab webhook test" },
      timestamp: Math.floor(Date.now() / 1000),
    });
    if (result.ok) {
      toast("Test successful!", "success");
    } else {
      toast(`Test failed: ${result.error || `HTTP ${result.status}`}`, "error");
    }
    setTesting(null);
  };

  const toggleEvent = (eventType: string) => {
    setNewEvents((prev) =>
      prev.includes(eventType) ? prev.filter((e) => e !== eventType) : [...prev, eventType]
    );
  };

  return (
    <div>
      <h3 className="text-sm font-medium mb-3">Webhooks</h3>
      <p className="text-xs text-text-muted mb-4">
        Receive HTTP POST notifications when events happen on this repo.
        Webhooks fire when you have this page open in your browser.
      </p>

      {/* Existing webhooks */}
      {webhooks.length > 0 && (
        <div className="space-y-2 mb-4">
          {webhooks.map((w) => (
            <div key={w.id} className={`border border-border rounded-lg p-3 ${w.enabled ? "" : "opacity-50"}`}>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleWebhook(w.id)}
                  className={`w-8 h-4 rounded-full cursor-pointer border-0 relative transition-colors ${w.enabled ? "bg-green" : "bg-bg-tertiary"}`}
                >
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${w.enabled ? "left-4" : "left-0.5"}`} />
                </button>
                <code className="text-xs font-mono text-text-secondary truncate flex-1">{w.url}</code>
                <button
                  onClick={() => testWebhook(w)}
                  disabled={testing === w.id}
                  className="text-[10px] px-2 py-0.5 border border-border rounded text-text-muted hover:text-text-primary bg-transparent cursor-pointer"
                >
                  {testing === w.id ? "..." : "Test"}
                </button>
                <button
                  onClick={() => removeWebhook(w.id)}
                  className="text-[10px] px-2 py-0.5 border border-red/30 rounded text-red hover:bg-red/10 bg-transparent cursor-pointer"
                >
                  Remove
                </button>
              </div>
              <div className="flex gap-1 mt-1.5">
                {w.events.map((e) => (
                  <span key={e} className="text-[10px] px-1.5 py-0 rounded bg-accent/10 text-accent">{e}</span>
                ))}
                {w.secret && (
                  <span className="text-[10px] px-1.5 py-0 rounded bg-orange/10 text-orange">signed</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add new webhook */}
      <div className="border border-dashed border-border rounded-lg p-3 space-y-2">
        <input
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://your-server.com/webhook"
          className="w-full bg-bg-primary border border-border rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        <div className="flex flex-wrap gap-1.5">
          {EVENT_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleEvent(t.id)}
              className={`text-xs px-2 py-0.5 rounded-full cursor-pointer border ${
                newEvents.includes(t.id)
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "bg-transparent text-text-muted border-border"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={newSecret}
          onChange={(e) => setNewSecret(e.target.value)}
          placeholder="Signing secret (optional)"
          className="w-full bg-bg-primary border border-border rounded-md px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        <button
          onClick={addWebhook}
          disabled={!newUrl.trim()}
          className="px-4 py-1.5 text-sm bg-green text-white rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
        >
          Add Webhook
        </button>
      </div>
    </div>
  );
}
