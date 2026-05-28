"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useNostr } from "@/hooks/useNostr";
import { clientPublish } from "@/lib/nostr/client-pool";
import { buildEventComment, eventCoordinate } from "@/lib/nostr/event-builder";
import { shortNpub } from "@/lib/utils";
import type { UserDTO } from "@/types";

interface CommentDTO {
  id: string;
  body: string;
  createdAt: string;
  user: UserDTO;
}

interface AnnouncementDTO {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: UserDTO;
}

interface EventDiscussionProps {
  eventId: string;
  organizerPubkey: string;
  dTag: string;
  nostrId: string;
  disabled?: boolean;
}

export function EventDiscussion({ eventId, organizerPubkey, dTag, nostrId, disabled }: EventDiscussionProps) {
  const { identity, login, signEvent } = useNostr();
  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementDTO[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}/comments`)
      .then((r) => (r.ok ? r.json() : { comments: [] }))
      .then((j) => setComments(j.comments ?? []))
      .catch(() => {});
    fetch(`/api/events/${eventId}/announcements`)
      .then((r) => (r.ok ? r.json() : { announcements: [] }))
      .then((j) => setAnnouncements(j.announcements ?? []))
      .catch(() => {});
  }, [eventId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (disabled) return;
    let currentIdentity = identity;
    if (!currentIdentity) {
      try { currentIdentity = await login(); } catch (er) { setErr((er as Error).message); return; }
    }
    const commentBody = body.trim();
    if (!commentBody) return;
    setBusy(true);
    try {
      const signed = await signEvent({
        ...buildEventComment({
          pubkey: currentIdentity.pubkey,
          eventCoordinate: eventCoordinate(organizerPubkey, dTag),
          organizerPubkey,
          eventNostrId: nostrId,
          content: commentBody,
        }),
      });
      const publishP = clientPublish(signed);
      const res = await fetch(`/api/events/${eventId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedCommentEvent: signed }),
      });
      await publishP.catch(() => ({ ok: 0, failed: 0 }));
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not post comment.");
      setComments((current) => [...current, json.comment]);
      setBody("");
    } catch (er) {
      setErr(er instanceof Error ? er.message : String(er));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {announcements.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold tracking-tight">Organizer updates</h3>
          {announcements.map((a) => (
            <article key={a.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="font-medium">{a.title}</div>
              <p className="text-sm text-fg2 mt-1 whitespace-pre-wrap">{a.body}</p>
              <div className="text-xs text-muted mt-3">
                {new Date(a.createdAt).toLocaleString()}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="font-semibold tracking-tight">Discussion</h3>
        {comments.length === 0 ? (
          <div className="text-sm text-muted">No comments yet.</div>
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => (
              <article key={comment.id} className="flex gap-3">
                <Avatar src={comment.user.picture} seed={comment.user.pubkey} alt={comment.user.npub} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {comment.user.displayName ?? comment.user.name ?? shortNpub(comment.user.npub)}
                  </div>
                  <p className="text-sm text-fg2 whitespace-pre-wrap">{comment.body}</p>
                  <div className="text-[11px] text-muted mt-1">{new Date(comment.createdAt).toLocaleString()}</div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={disabled ? "Discussion is closed for cancelled events." : "Add a comment"}
          disabled={disabled}
        />
        <div className="flex items-center justify-between">
          <div className="text-xs text-danger">{err}</div>
          <Button type="submit" size="sm" loading={busy} disabled={busy || disabled || !body.trim()}>
            Post
          </Button>
        </div>
      </form>
    </div>
  );
}
