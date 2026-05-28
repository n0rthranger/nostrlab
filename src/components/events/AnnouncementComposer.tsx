"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useNostr } from "@/hooks/useNostr";
import { clientPublish } from "@/lib/nostr/client-pool";
import { buildEventAnnouncement, eventCoordinate } from "@/lib/nostr/event-builder";

interface AnnouncementComposerProps {
  eventId: string;
  organizerPubkey: string;
  dTag: string;
  nostrId: string;
}

export function AnnouncementComposer({ eventId, organizerPubkey, dTag, nostrId }: AnnouncementComposerProps) {
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
    const nextTitle = title.trim();
    const nextBody = body.trim();
    if (!nextTitle || !nextBody) {
      setErr("Title and message are required.");
      return;
    }
    setBusy(true);
    try {
      const signed = await signEvent({
        ...buildEventAnnouncement({
          pubkey: currentIdentity.pubkey,
          eventCoordinate: eventCoordinate(organizerPubkey, dTag),
          organizerPubkey,
          eventNostrId: nostrId,
          title: nextTitle,
          content: nextBody,
        }),
      });
      const publishP = clientPublish(signed);
      const res = await fetch(`/api/events/${eventId}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedAnnouncementEvent: signed }),
      });
      await publishP.catch(() => ({ ok: 0, failed: 0 }));
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
