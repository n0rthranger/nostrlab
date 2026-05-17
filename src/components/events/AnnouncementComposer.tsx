"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useNostr } from "@/hooks/useNostr";
import { hashAuthPayload } from "@/lib/auth-client";

export function AnnouncementComposer({ eventId }: { eventId: string }) {
  const { identity, login, signEvent } = useNostr();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSent(false);
    let currentIdentity = identity;
    if (!currentIdentity) {
      try { currentIdentity = await login(); } catch (er) { setErr((er as Error).message); return; }
    }
    const payload = { eventId, title: title.trim(), body: body.trim() };
    if (!payload.title || !payload.body) {
      setErr("Title and message are required.");
      return;
    }
    setBusy(true);
    try {
      const payloadHash = await hashAuthPayload(payload);
      const signed = await signEvent({
        pubkey: currentIdentity.pubkey,
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        content: "",
        tags: [
          ["action", "event.announcement"],
          ["e", eventId],
          ["payload_hash", payloadHash],
        ],
      });
      const res = await fetch(`/api/events/${eventId}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, signedAuthEvent: signed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not send announcement.");
      setTitle("");
      setBody("");
      setSent(true);
    } catch (er) {
      setErr(er instanceof Error ? er.message : String(er));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-surface border border-border shadow-soft p-5">
      <h2 className="text-xl font-semibold tracking-tight">Announcement</h2>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Subject" maxLength={120} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message to attendees" rows={4} />
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs">
            {err && <span className="text-danger">{err}</span>}
            {sent && <span className="text-success">Sent to attendees.</span>}
          </div>
          <Button type="submit" loading={busy} disabled={busy}>Send</Button>
        </div>
      </form>
    </section>
  );
}
