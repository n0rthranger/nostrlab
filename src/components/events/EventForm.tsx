"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useNostr } from "@/hooks/useNostr";
import { buildEventListing } from "@/lib/nostr/event-builder";
import { clientPublish } from "@/lib/nostr/client-pool";
import { slugify } from "@/lib/utils";
import { findHub } from "@/lib/cities";
import { BannerUploader } from "./BannerUploader";
import { LocationPicker } from "./LocationPicker";
import { CityAutocomplete } from "./CityAutocomplete";
import type { CommunityDTO } from "@/types";

interface EventFormInitial {
  id?: string;
  dTag?: string;
  title?: string;
  description?: string;
  bannerUrl?: string | null;
  startsAt?: string;
  endsAt?: string | null;
  city?: string | null;
  venue?: string | null;
  geohash?: string | null;
  mode?: "online" | "offline" | "hybrid";
  tags?: string[];
  capacity?: number | null;
  paymentMode?: "FREE" | "PAID";
  priceSats?: number | null;
  cohostPubkeys?: string[];
  communitySlug?: string | null;
}

interface EventFormProps {
  initialEvent?: EventFormInitial;
  submitLabel?: string;
  allowRecurrence?: boolean;
}

interface DuplicateCheckMatch {
  id: string;
  title: string;
  startsAt: string;
  city: string | null;
  venue: string | null;
  mode: "ONLINE" | "OFFLINE" | "HYBRID";
}

type DuplicateCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "clear" }
  | { status: "match"; match: DuplicateCheckMatch }
  | { status: "error" };

function toDatetimeLocal(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function shiftDate(date: Date, frequency: "weekly" | "monthly", index: number): Date {
  const next = new Date(date);
  if (frequency === "weekly") next.setDate(next.getDate() + index * 7);
  else next.setMonth(next.getMonth() + index);
  return next;
}

export function EventForm({ initialEvent, submitLabel, allowRecurrence = true }: EventFormProps) {
  const router = useRouter();
  const { identity, signEvent, hasSigner, login } = useNostr();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState(initialEvent?.title ?? "");
  const [description, setDescription] = useState(initialEvent?.description ?? "");
  const [bannerUrl, setBannerUrl] = useState(initialEvent?.bannerUrl ?? "");
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(initialEvent?.startsAt));
  const [endsAt, setEndsAt] = useState(toDatetimeLocal(initialEvent?.endsAt));
  const [city, setCity] = useState(initialEvent?.city ?? "");
  const [venue, setVenue] = useState(initialEvent?.venue ?? "");
  const [geohash, setGeohash] = useState<string | null>(initialEvent?.geohash ?? null);
  const [mode, setMode] = useState<"online" | "offline" | "hybrid">(initialEvent?.mode ?? "offline");
  const [tags, setTags] = useState((initialEvent?.tags ?? []).join(", "));
  const [capacity, setCapacity] = useState(initialEvent?.capacity ? String(initialEvent.capacity) : "");
  const [paid, setPaid] = useState(initialEvent?.paymentMode === "PAID");
  const [priceSats, setPriceSats] = useState(initialEvent?.priceSats ? String(initialEvent.priceSats) : "");
  const [cohosts, setCohosts] = useState((initialEvent?.cohostPubkeys ?? []).join(", "));
  const [communitySlug, setCommunitySlug] = useState(initialEvent?.communitySlug ?? "");
  const [communities, setCommunities] = useState<CommunityDTO[]>([]);
  const [recurrence, setRecurrence] = useState<"none" | "weekly" | "monthly">("none");
  const [recurrenceCount, setRecurrenceCount] = useState("4");
  const [duplicateCheck, setDuplicateCheck] = useState<DuplicateCheckState>({ status: "idle" });
  const isEditing = !!initialEvent?.id && !!initialEvent.dTag;
  // Nominatim suggestion can override the hub-based center. `precise` tells
  // the picker to also drop a pin (street/address level) instead of just
  // flying the camera (city level).
  const [mapSuggestedCenter, setMapSuggestedCenter] = useState<{ lat: number; lng: number; precise?: boolean } | null>(null);

  // When the user types a known city, suggest its hub coords as the map's
  // starting center. Pin still requires an explicit click.
  const suggestedCenter = useMemo(() => {
    if (!city) return null;
    const h = findHub(city);
    return h ? { lat: h.lat, lng: h.lng } : null;
  }, [city]);

  useEffect(() => {
    if (!identity) {
      setCommunities([]);
      return;
    }
    fetch(`/api/communities?host=${identity.pubkey}`)
      .then((r) => (r.ok ? r.json() : { communities: [] }))
      .then((j) => setCommunities(j.communities ?? []))
      .catch(() => setCommunities([]));
  }, [identity]);

  useEffect(() => {
    const cleanTitle = title.trim();
    const start = startsAt ? new Date(startsAt) : null;
    const hasLocation = mode === "online" || !!city.trim() || !!venue.trim() || !!geohash;
    if (!cleanTitle || !start || Number.isNaN(start.getTime()) || !hasLocation) {
      setDuplicateCheck({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setDuplicateCheck({ status: "checking" });
    const timeout = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/events/duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            title: cleanTitle,
            startsAt: start.toISOString(),
            mode,
            city: city.trim() || null,
            venue: venue.trim() || null,
            geohash,
            organizerPubkey: identity?.pubkey ?? null,
            dTag: isEditing ? initialEvent?.dTag ?? null : null,
            excludeEventId: initialEvent?.id ?? null,
          }),
        });
        if (!res.ok) throw new Error("duplicate check failed");
        const json = (await res.json()) as { duplicate: DuplicateCheckMatch | null };
        setDuplicateCheck(json.duplicate ? { status: "match", match: json.duplicate } : { status: "clear" });
      } catch (error) {
        if ((error as Error).name !== "AbortError") setDuplicateCheck({ status: "error" });
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [title, startsAt, mode, city, venue, geohash, identity?.pubkey, isEditing, initialEvent?.dTag, initialEvent?.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    let currentIdentity = identity;
    if (!currentIdentity) {
      try { currentIdentity = await login(); } catch (er) { setErr((er as Error).message); return; }
    }
    if (!title || !description || !startsAt) {
      setErr("Title, description, and start time are required.");
      return;
    }
    const selectedCommunity = communitySlug
      ? communities.find((c) => c.slug === communitySlug)
      : null;
    if (communitySlug && !selectedCommunity) {
      setErr("Select an approved community calendar again before publishing.");
      return;
    }
    if (duplicateCheck.status === "match") {
      setErr("A matching event already exists. Open the existing event instead of publishing a duplicate.");
      return;
    }

    setBusy(true);
    try {
      const count = !isEditing && recurrence !== "none"
        ? Math.min(24, Math.max(1, Number(recurrenceCount) || 1))
        : 1;
      const recurrenceFrequency = recurrence === "weekly" || recurrence === "monthly" ? recurrence : undefined;
      const recurrenceGroupId = count > 1
        ? `${slugify(title)}-${Math.random().toString(36).slice(2, 8)}`
        : undefined;
      const baseStart = new Date(startsAt);
      const baseEnd = endsAt ? new Date(endsAt) : undefined;
      let firstId: string | null = null;
      for (let i = 0; i < count; i++) {
        const start = i === 0 || !recurrenceFrequency ? baseStart : shiftDate(baseStart, recurrenceFrequency, i);
        const end = baseEnd
          ? (i === 0 || !recurrenceFrequency ? baseEnd : shiftDate(baseEnd, recurrenceFrequency, i))
          : undefined;
        const dTag = isEditing
          ? initialEvent!.dTag!
          : `${slugify(title)}-${Math.random().toString(36).slice(2, 7)}${count > 1 ? `-${i + 1}` : ""}`;
        const unsigned = buildEventListing({
          pubkey: currentIdentity.pubkey, dTag,
          title: title.trim(), description: description.trim(),
          bannerUrl: bannerUrl.trim() || undefined,
          startsAt: start,
          endsAt: end,
          city: city.trim() || undefined,
          venue: venue.trim() || undefined,
          geohash: mode !== "online" ? geohash ?? undefined : undefined,
          mode,
          capacity: capacity ? Number(capacity) : undefined,
          priceSats: paid ? Number(priceSats) : undefined,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          cohostPubkeys: cohosts
            .split(",").map((s) => s.trim())
            .filter((s) => /^[0-9a-f]{64}$/i.test(s)),
          communitySlug: communitySlug || undefined,
          communityOwnerPubkey: selectedCommunity?.organizer.pubkey,
          recurrenceGroupId,
          recurrenceIndex: recurrenceGroupId ? i : undefined,
          recurrenceFrequency: recurrenceGroupId ? recurrenceFrequency : undefined,
        });
        const signed = await signEvent(unsigned);
        const indexRes = await fetch("/api/events", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signedEvent: signed }),
        });
        if (!indexRes.ok) {
          const responseText = await indexRes.text();
          let message = responseText || String(indexRes.status);
          try {
            const json = JSON.parse(responseText) as { message?: string; existingEvent?: DuplicateCheckMatch };
            if (indexRes.status === 409 && json.existingEvent) {
              setDuplicateCheck({ status: "match", match: json.existingEvent });
              message = json.message ?? "A matching event already exists.";
            } else if (json.message) {
              message = json.message;
            }
          } catch {
            // Keep the raw response text.
          }
          throw new Error(`Indexing failed: ${message}`);
        }
        const json = (await indexRes.json()) as { id: string };
        firstId ??= json.id;
        clientPublish(signed).catch(() => {});
      }
      router.push(isEditing && initialEvent?.id ? `/dashboard/events/${initialEvent.id}` : `/events/${firstId}`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <Section title="The basics" hint="What's it called and what's it about.">
        <Field label="Title" required>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chicago Bitcoin BBQ" />
        </Field>
        <Field label="Description" required>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5}
            placeholder="A few sentences about what to expect, who it's for, and what to bring." />
        </Field>
        <Field label="Banner image">
          <BannerUploader value={bannerUrl} onChange={setBannerUrl} />
        </Field>
      </Section>

      <Section title="When & where" hint="Times in your local timezone.">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Starts" required>
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Ends">
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </div>
        <Field label="Format">
          <div className="flex gap-2">
            {(["offline", "online", "hybrid"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`flex-1 h-10 rounded-full text-sm font-medium border transition-colors ${
                  mode === m ? "bg-fg text-bg border-fg" : "border-border text-muted hover:text-fg"
                }`}>
                {m === "offline" ? "In-person" : m === "online" ? "Online" : "Hybrid"}
              </button>
            ))}
          </div>
        </Field>
        {mode !== "online" && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="City or address" hint="Type a city or full street address.">
                <CityAutocomplete
                  value={city}
                  onChange={setCity}
                  onPick={(p) => {
                    // Auto-fill venue with the street if the user picked a
                    // street/place-level result and the venue is still empty.
                    if (p.street && !venue.trim()) setVenue(p.street);
                    setMapSuggestedCenter({ lat: p.lat, lng: p.lng, precise: p.isPrecise });
                  }}
                />
              </Field>
              <Field label="Venue"><input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Lincoln Park Pavilion" /></Field>
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-sm font-medium">Pin location</span>
                <span className="text-[11px] text-muted">Optional but recommended</span>
              </div>
              <LocationPicker
                suggestedCenter={mapSuggestedCenter ?? suggestedCenter}
                onChange={(next) => setGeohash(next?.geohash ?? null)}
              />
              <div className="text-xs text-muted mt-1.5">
                Click on the map to drop a pin where the event happens. Attendees see this on the event page.
              </div>
            </div>
          </>
        )}
      </Section>

      <Section title="Tags & capacity" hint="Help people find your event.">
        {communities.length > 0 && (
          <Field
            label="Community calendar"
            hint="Only communities where you are the owner or an approved host appear here."
          >
            <select
              value={communitySlug}
              onChange={(e) => setCommunitySlug(e.target.value)}
              className="w-full h-10 rounded-lg border border-border bg-surface px-3 text-sm"
            >
              <option value="">No community</option>
              {communities.map((c) => (
                <option key={c.id} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Tags" hint="Comma-separated. Lowercase.">
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="bitcoin, nostr, chicago" />
          </Field>
          <Field label="Capacity">
            <input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="100" />
          </Field>
        </div>
        <Field label="Co-host pubkeys" hint="Hex pubkeys, comma-separated. They'll be able to scan tickets.">
          <input value={cohosts} onChange={(e) => setCohosts(e.target.value)} placeholder="abc123… , def456…" />
        </Field>
      </Section>

      {!isEditing && allowRecurrence && (
        <Section title="Repeat" hint="Create a small recurring series in one pass.">
          <div className="grid sm:grid-cols-[1fr_120px] gap-4">
            <Field label="Frequency">
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as "none" | "weekly" | "monthly")}
                className="w-full h-10 rounded-lg border border-border bg-surface px-3 text-sm"
              >
                <option value="none">Does not repeat</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </Field>
            {recurrence !== "none" && (
              <Field label="Count">
                <input
                  type="number"
                  min="2"
                  max="24"
                  value={recurrenceCount}
                  onChange={(e) => setRecurrenceCount(e.target.value)}
                />
              </Field>
            )}
          </div>
        </Section>
      )}

      <Section title="Tickets" hint="Free events use RSVPs. Paid events settle directly to your wallet.">
        <label className="flex items-center gap-3 cursor-pointer p-4 rounded-xl border border-border hover:bg-surface2/50 transition-colors">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)}
            className="!w-4 !h-4 !p-0 accent-accent" />
          <div className="flex-1">
            <div className="font-medium text-sm">Charge admission in sats</div>
            <div className="text-xs text-muted">Sats settle directly to your Lightning Address. NostrLab never holds funds.</div>
          </div>
        </label>
        {paid && (
          <>
            <PayoutIndicator />
            <Field label="Price (sats)">
              <div className="flex items-baseline gap-2">
                <input type="number" min="1" value={priceSats}
                  onChange={(e) => setPriceSats(e.target.value)} placeholder="21000" className="!max-w-xs" />
              </div>
            </Field>
          </>
        )}
      </Section>

      {err && <div className="rounded-lg bg-dangerSoft text-danger px-4 py-3 text-sm">{err}</div>}
      {duplicateCheck.status === "match" && (
        <DuplicateWarning match={duplicateCheck.match} />
      )}
      {!hasSigner && (
        <div className="rounded-lg bg-surface2 text-fg2 px-4 py-3 text-sm">
          No NIP-07 signer detected. Install Alby or nos2x to publish.
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4 border-t border-border">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={busy} disabled={busy || duplicateCheck.status === "match"} size="lg">
          {submitLabel ?? (isEditing ? "Publish update" : "Publish event")}
        </Button>
      </div>
    </form>
  );
}

function DuplicateWarning({ match }: { match: DuplicateCheckMatch }) {
  const start = new Date(match.startsAt);
  const when = Number.isNaN(start.getTime())
    ? null
    : start.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const location = match.mode === "ONLINE" ? "Online" : [match.venue, match.city].filter(Boolean).join(", ");

  return (
    <div className="rounded-xl border border-accent/25 bg-accentSoft/35 px-4 py-3 flex items-start gap-3">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-accent mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-medium text-fg">Matching event already exists</div>
        <div className="mt-1 text-xs text-muted">
          <span className="font-medium text-fg2">{match.title}</span>
          {when ? ` · ${when}` : ""}
          {location ? ` · ${location}` : ""}
        </div>
        <Link href={`/events/${match.id}`} className="mt-2 inline-flex h-8 items-center rounded-full border border-border bg-surface px-3 text-xs font-medium text-fg hover:bg-surface2">
          Open existing event
        </Link>
      </div>
    </div>
  );
}

function Section({
  title, hint, children,
}: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-semibold text-base">{title}</h2>
        {hint && <p className="text-sm text-muted mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function PayoutIndicator() {
  const { profile } = useNostr();
  const lud16 = profile?.lud16;

  if (lud16) {
    return (
      <div className="rounded-xl border border-success/20 bg-successSoft px-4 py-3 flex items-start gap-3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-success mt-0.5 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
        <div className="text-sm flex-1 min-w-0">
          <div className="font-medium">Receiving via Lightning Address</div>
          <div className="text-muted text-xs mt-0.5 truncate font-mono">{lud16}</div>
          <div className="text-[11px] text-muted mt-1">
            Pulled from your Nostr profile (lud16). To change it, update your profile in any Nostr client.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-danger/20 bg-dangerSoft px-4 py-3 flex items-start gap-3">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-danger mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div className="text-sm flex-1">
        <div className="font-medium text-danger">No Lightning Address found</div>
        <div className="text-fg2 text-xs mt-1 leading-relaxed">
          Your Nostr profile has no <code className="font-mono">lud16</code> field, so we can't route sats to you. Set one up first:
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <a href="https://getalby.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border bg-surface text-xs hover:bg-surface2">
            Alby ↗
          </a>
          <a href="https://strike.me" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border bg-surface text-xs hover:bg-surface2">
            Strike ↗
          </a>
          <a href="https://coinos.io" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border bg-surface text-xs hover:bg-surface2">
            Coinos ↗
          </a>
          <a href="https://walletofsatoshi.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border bg-surface text-xs hover:bg-surface2">
            Wallet of Satoshi ↗
          </a>
        </div>
        <div className="text-[11px] text-muted mt-2">
          Then add the address to your Nostr profile's <code className="font-mono">lud16</code> field and refresh.
        </div>
      </div>
    </div>
  );
}

function Field({
  label, hint, required, children,
}: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium">
          {label}{required && <span className="text-accent ml-0.5">*</span>}
        </span>
        {hint && <span className="text-[11px] text-muted">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
