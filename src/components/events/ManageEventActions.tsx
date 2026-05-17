"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useNostr } from "@/hooks/useNostr";
import { hashAuthPayload } from "@/lib/auth-client";
import { buildEventDeletion, eventCoordinate } from "@/lib/nostr/event-builder";
import { clientPublish } from "@/lib/nostr/client-pool";

export function ManageEventActions({
  eventId,
  organizerPubkey,
  dTag,
  nostrId,
  status,
  canDelete,
  deleteBlockedReason,
}: {
  eventId: string;
  organizerPubkey: string;
  dTag: string;
  nostrId: string;
  status: "ACTIVE" | "CANCELLED";
  canDelete: boolean;
  deleteBlockedReason: string | null;
}) {
  const router = useRouter();
  const { identity, login, signEvent } = useNostr();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [currentStatus, setCurrentStatus] = useState(status);

  async function setEventStatus(action: "cancel" | "restore") {
    setErr(null);
    let currentIdentity = identity;
    if (!currentIdentity) {
      try { currentIdentity = await login(); } catch (e) { setErr((e as Error).message); return; }
    }
    const payload = { eventId, reason: action === "cancel" ? reason.trim() || null : null };
    setBusy(true);
    try {
      const payloadHash = await hashAuthPayload(payload);
      const signed = await signEvent({
        pubkey: currentIdentity.pubkey,
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        content: "",
        tags: [
          ["action", action === "cancel" ? "event.cancel" : "event.restore"],
          ["e", eventId],
          ["payload_hash", payloadHash],
        ],
      });
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: payload.reason, signedAuthEvent: signed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not update status.");
      setCurrentStatus(json.status);
      setReason("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteEvent() {
    setErr(null);
    let currentIdentity = identity;
    if (!currentIdentity) {
      try { currentIdentity = await login(); } catch (e) { setErr((e as Error).message); return; }
    }
    if (currentIdentity.pubkey.toLowerCase() !== organizerPubkey.toLowerCase()) {
      setErr("Only the original organizer can sign a Nostr deletion event.");
      return;
    }
    if (!window.confirm("Delete this event from NostrLab and publish a Nostr deletion event? This cannot be undone.")) return;

    setBusy(true);
    try {
      const deletion = await signEvent(buildEventDeletion({
        pubkey: currentIdentity.pubkey,
        eventId: nostrId,
        eventCoordinate: eventCoordinate(organizerPubkey.toLowerCase(), dTag),
        reason: deleteReason.trim() || null,
      }));
      const publishP = clientPublish(deletion);
      const res = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedDeletionEvent: deletion }),
      });
      const json = await res.json();
      await publishP.catch(() => ({ ok: 0, failed: 0 }));
      if (!res.ok) throw new Error(json.message ?? json.error ?? "Could not delete event.");
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-surface border border-border shadow-soft p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Organizer tools</h2>
          <p className="text-sm text-muted mt-1">Edit, duplicate, cancel, or delete a mistaken empty event.</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Link href={`/dashboard/events/${eventId}/edit`} className="h-9 px-3 inline-flex items-center rounded-full border border-border text-sm font-medium hover:bg-surface2">
            Edit
          </Link>
          <Link href={`/events/create?duplicate=${eventId}`} className="h-9 px-3 inline-flex items-center rounded-full border border-border text-sm font-medium hover:bg-surface2">
            Duplicate
          </Link>
        </div>
      </div>
      {currentStatus === "ACTIVE" ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Cancellation note for attendees"
          />
          <Button variant="outline" onClick={() => setEventStatus("cancel")} loading={busy} disabled={busy}>
            Cancel event
          </Button>
        </div>
      ) : (
        <Button onClick={() => setEventStatus("restore")} loading={busy} disabled={busy}>
          Restore event
        </Button>
      )}
      <div className="border-t border-border pt-4 space-y-2">
        <div className="text-sm font-medium">Delete mistaken event</div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            placeholder="Deletion reason for relays"
            disabled={!canDelete || busy}
          />
          <Button variant="outline" onClick={deleteEvent} loading={busy} disabled={busy || !canDelete}>
            Delete event
          </Button>
        </div>
        {!canDelete && (
          <div className="text-xs text-muted">
            {deleteBlockedReason ?? "Deletion is available only to the original organizer before attendee or payment activity exists."}
          </div>
        )}
      </div>
      {err && <div className="text-xs text-danger">{err}</div>}
    </section>
  );
}
