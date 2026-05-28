"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { BannerUploader } from "@/components/events/BannerUploader";
import { useNostr } from "@/hooks/useNostr";
import { hashAuthPayload } from "@/lib/auth-client";
import { normalizePubkey } from "@/lib/nostr/encode";
import { buildCalendarList, buildCommunityDefinition } from "@/lib/nostr/event-builder";
import { clientPublish } from "@/lib/nostr/client-pool";
import { getClientRelays } from "@/lib/nostr/relays";

interface InitialCommunity {
  id: string;
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
  website: string | null;
  tags: string[];
  moderators: string[];
}

function uniqueTags(raw: string): string[] {
  return Array.from(new Set(
    raw
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, "").toLowerCase().trim())
      .filter(Boolean)
  )).slice(0, 10);
}

function parsePubkeys(raw: string): string[] {
  return Array.from(new Set(
    raw
      .split(/[,\s]+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => normalizePubkey(p))
  ));
}

function publicUrl(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return value;
  return `${window.location.origin}${value}`;
}

export function CommunitySettingsForm({ initial }: { initial: InitialCommunity }) {
  const router = useRouter();
  const { identity, signEvent } = useNostr();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [imageUrl, setImageUrl] = useState(initial.imageUrl ?? "");
  const [website, setWebsite] = useState(initial.website ?? "");
  const [tagsRaw, setTagsRaw] = useState(initial.tags.join(", "));
  const [hostsRaw, setHostsRaw] = useState(initial.moderators.join("\n"));
  const [transferRaw, setTransferRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!identity) { setErr("Sign in again before updating this community."); return; }
    if (name.trim().length < 2) { setErr("Name must be at least 2 characters."); return; }
    if (!description.trim()) { setErr("Description is required."); return; }

    let moderators: string[];
    let transferPubkey: string | null = null;
    try {
      moderators = parsePubkeys(hostsRaw);
      if (transferRaw.trim()) transferPubkey = normalizePubkey(transferRaw.trim());
    } catch {
      setErr("Approved hosts and transfer owner must be valid npub or 64-character hex pubkeys.");
      return;
    }
    if (moderators.length > 20) { setErr("Add up to 20 approved hosts."); return; }

    const payload = {
      communityId: initial.id,
      name: name.trim(),
      description: description.trim(),
      imageUrl: imageUrl.trim() || null,
      website: website.trim() || null,
      tags: uniqueTags(tagsRaw),
      moderators,
      transferPubkey,
    };

    setBusy(true);
    try {
      const payloadHash = await hashAuthPayload(payload);
      const signed = await signEvent({
        pubkey: identity.pubkey,
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        content: "",
        tags: [
          ["action", "community.update"],
          ["community_id", initial.id],
          ["payload_hash", payloadHash],
        ],
      });
      const nextOwner = transferPubkey ?? identity.pubkey;
      const signedCommunityEvent = nextOwner === identity.pubkey
        ? await signEvent(buildCommunityDefinition({
            pubkey: identity.pubkey,
            slug: initial.slug,
            name: payload.name,
            description: payload.description,
            imageUrl: publicUrl(payload.imageUrl),
            website: payload.website,
            tags: payload.tags,
            moderatorPubkeys: moderators,
            relays: getClientRelays(),
          }))
        : undefined;
      const signedCalendarEvent = nextOwner === identity.pubkey
        ? await signEvent(buildCalendarList({
            pubkey: identity.pubkey,
            dTag: initial.slug,
            title: payload.name,
            description: payload.description,
          }))
        : undefined;
      const res = await fetch(`/api/communities/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, signedAuthEvent: signed, signedCommunityEvent, signedCalendarEvent }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = typeof json.error === "string"
          ? json.error
          : json.error?.fieldErrors
          ? Object.values(json.error.fieldErrors).flat().join(" · ")
          : "Community update failed.";
        throw new Error(message);
      }
      if (signedCommunityEvent) clientPublish(signedCommunityEvent).catch(() => {});
      if (signedCalendarEvent) clientPublish(signedCalendarEvent).catch(() => {});
      router.push(`/communities/${initial.slug}`);
      router.refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Field label="Name" required>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
      </Field>
      <Field label="Description" required>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={2000} required />
      </Field>
      <Field label="Cover image">
        <BannerUploader
          value={imageUrl}
          onChange={setImageUrl}
          aspect="1/1"
          sizeHint="512 x 512 px"
          helperText="Square images work best for community avatars."
        />
      </Field>
      <Field label="Website" hint="Use an HTTPS URL. It verifies automatically when the domain matches your NIP-05 or profile website.">
        <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.org" />
      </Field>
      <Field label="Approved hosts" hint="Npub or hex pubkeys that can publish official events under this community.">
        <textarea value={hostsRaw} onChange={(e) => setHostsRaw(e.target.value)} rows={4} />
      </Field>
      <Field label="Tags" hint="Comma-separated. Lowercase. Max 10.">
        <input value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} />
      </Field>
      <Field label="Transfer ownership" hint="Optional. Enter the next owner pubkey only when you are ready to hand off this community.">
        <input value={transferRaw} onChange={(e) => setTransferRaw(e.target.value)} placeholder="npub1... or hex pubkey" />
      </Field>

      {err && <div className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">{err}</div>}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Saving..." : "Save settings"}
        </Button>
        <Link href={`/communities/${initial.slug}`} className="text-sm text-muted hover:text-fg">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-sm font-medium">
        {label}{required && <span className="text-violet-600 ml-1">*</span>}
      </div>
      {children}
      {hint && <div className="text-xs text-muted mt-1.5 leading-snug">{hint}</div>}
    </label>
  );
}
