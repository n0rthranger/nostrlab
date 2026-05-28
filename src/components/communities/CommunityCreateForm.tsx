"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useNostr } from "@/hooks/useNostr";
import { Button } from "@/components/ui/Button";
import { BannerUploader } from "@/components/events/BannerUploader";
import { hashAuthPayload } from "@/lib/auth-client";
import { normalizePubkey } from "@/lib/nostr/encode";
import { buildCalendarList, buildCommunityDefinition } from "@/lib/nostr/event-builder";
import { clientPublish } from "@/lib/nostr/client-pool";
import { getClientRelays } from "@/lib/nostr/relays";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function publicUrl(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return value;
  return `${window.location.origin}${value}`;
}

export function CommunityCreateForm() {
  const router = useRouter();
  const { identity, hasSigner, login, signEvent } = useNostr();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [website, setWebsite] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [hostsRaw, setHostsRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  if (!identity) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <h2 className="text-xl font-semibold tracking-tight">Sign in to host a community</h2>
        <p className="text-muted mt-2 max-w-md mx-auto">
          Communities are tied to your Nostr key. No email, no password.
        </p>
        <div className="mt-6">
          <Button size="lg" onClick={() => login().catch(() => {})} disabled={!hasSigner}>
            {hasSigner ? "Sign in with Nostr" : "Use header Sign in for Nostr Connect"}
          </Button>
        </div>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!identity) return;
    if (name.trim().length < 2) { setErr("Give it a name (at least 2 characters)."); return; }
    if (effectiveSlug.length < 2) { setErr("Slug must be at least 2 characters."); return; }
    if (description.trim().length === 0) { setErr("Add a short description."); return; }

    const tags = Array.from(new Set(
      tagsRaw
        .split(/[,\s]+/)
        .map((t) => t.replace(/^#/, "").toLowerCase().trim())
        .filter(Boolean)
    )).slice(0, 10);
    const hostInputs = hostsRaw.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean);
    const moderators: string[] = [];
    for (const hostInput of hostInputs) {
      try {
        moderators.push(normalizePubkey(hostInput));
      } catch {
        setErr("Approved hosts must be valid npub or 64-character hex pubkeys.");
        return;
      }
    }
    if (moderators.length > 20) {
      setErr("Add up to 20 approved hosts.");
      return;
    }
    const uniqueModerators = Array.from(new Set(moderators));

    setBusy(true);
    try {
      const payload = {
        slug: effectiveSlug,
        name: name.trim(),
        description: description.trim(),
        imageUrl: imageUrl.trim() || null,
        website: website.trim() || null,
        tags,
        moderators: uniqueModerators,
      };
      const payloadHash = await hashAuthPayload(payload);
      const signed = await signEvent({
        pubkey: identity.pubkey,
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        content: "",
        tags: [
          ["action", "community.create"],
          ["slug", effectiveSlug],
          ["payload_hash", payloadHash],
        ],
      });
      const signedCommunityEvent = await signEvent(buildCommunityDefinition({
        pubkey: identity.pubkey,
        slug: effectiveSlug,
        name: payload.name,
        description: payload.description,
        imageUrl: publicUrl(payload.imageUrl),
        website: payload.website,
        tags,
        moderatorPubkeys: uniqueModerators,
        relays: getClientRelays(),
      }));
      const signedCalendarEvent = await signEvent(buildCalendarList({
        pubkey: identity.pubkey,
        dTag: effectiveSlug,
        title: payload.name,
        description: payload.description,
      }));

      const res = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signedAuthEvent: signed,
          signedCommunityEvent,
          signedCalendarEvent,
          ...payload,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const errMsg = typeof json.error === "string"
          ? json.error
          : json.error?.fieldErrors
          ? Object.values(json.error.fieldErrors).flat().join(" · ")
          : "Failed to create community.";
        throw new Error(errMsg);
      }
      clientPublish(signedCommunityEvent).catch(() => {});
      clientPublish(signedCalendarEvent).catch(() => {});
      router.push(`/communities/${json.community.slug}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Field label="Name" required hint="What people will see — e.g. ‘Chicago Bitcoin Collective’.">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Chicago Bitcoin Collective"
          required
        />
      </Field>

      <Field
        label="URL slug"
        required
        hint={`nostrlab.com/communities/${effectiveSlug || "your-slug"}`}
      >
        <input
          type="text"
          value={effectiveSlug}
          onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setSlugTouched(true); }}
          maxLength={60}
          pattern="[a-z0-9-]+"
          placeholder="chicago-bitcoin"
          required
        />
      </Field>

      <Field label="Description" required hint="A few sentences about who shows up and what you host.">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Monthly meetups for plebs, devs, and the Bitcoin-curious. Bring laptops or just curiosity."
          required
        />
      </Field>

      <Field label="Cover image" hint="Used as the calendar avatar across the site.">
        <BannerUploader
          value={imageUrl}
          onChange={setImageUrl}
          aspect="1/1"
          sizeHint="512 × 512 px · square"
          helperText="Optional. Square images work best — used as the community avatar."
        />
      </Field>

      <Field label="Website" hint="Optional. HTTPS links can show as verified when they match your NIP-05 or profile website domain.">
        <input
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://example.org"
        />
      </Field>

      <Field
        label="Approved hosts"
        hint="Optional. Add Nostr npubs or hex pubkeys that can publish official events under this community."
      >
        <textarea
          value={hostsRaw}
          onChange={(e) => setHostsRaw(e.target.value)}
          rows={3}
          placeholder="64-character pubkey, one per line"
        />
      </Field>

      <Field label="Tags" hint="Comma-separated. Lowercase. Max 10. (e.g. bitcoin, meetup, chicago)">
        <input
          type="text"
          value={tagsRaw}
          onChange={(e) => setTagsRaw(e.target.value)}
          placeholder="bitcoin, meetup, chicago"
        />
      </Field>

      {err && (
        <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-4 py-3">
          {err}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Publishing…" : "Create community"}
        </Button>
        <Link href="/communities" className="text-sm text-muted hover:text-fg transition-colors">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium">
          {label}
          {required && <span className="text-violet-600 ml-1">*</span>}
        </span>
      </div>
      {children}
      {hint && <div className="text-xs text-muted mt-1.5 leading-snug">{hint}</div>}
    </label>
  );
}
