import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  pool,
  fetchProfiles,
  shortenKey,
  timeAgo,
  repoAddress,
  signWith,
  DEFAULT_RELAYS,
} from "../lib/nostr";
import { WIKI_PAGE } from "../types/nostr";
import type { WikiPageEvent, UserProfile } from "../types/nostr";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";
import MarkdownContent from "../components/MarkdownContent";

export default function WikiPage() {
  const { pubkey: repoPubkey, identifier, pageSlug } = useParams();
  const { pubkey: userPubkey, signer } = useAuth();
  const { toast } = useToast();
  const [pages, setPages] = useState<WikiPageEvent[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const addr = repoPubkey && identifier ? repoAddress(repoPubkey, identifier) : "";

  useEffect(() => {
    if (!addr) return;
    let cancelled = false;

    pool.querySync(DEFAULT_RELAYS, { kinds: [WIKI_PAGE], "#a": [addr] }).then(async (events) => {
      if (cancelled) return;
      // Deduplicate by identifier (keep latest)
      const byIdent = new Map<string, WikiPageEvent>();
      for (const e of events) {
        const ident = e.tags.find((t) => t[0] === "d")?.[1] ?? e.id;
        const existing = byIdent.get(ident);
        if (!existing || e.created_at > existing.createdAt) {
          byIdent.set(ident, {
            id: e.id,
            pubkey: e.pubkey,
            content: e.content,
            repoAddress: e.tags.find((t) => t[0] === "a")?.[1] ?? "",
            identifier: ident,
            title: e.tags.find((t) => t[0] === "title")?.[1] ?? ident,
            createdAt: e.created_at,
          });
        }
      }
      const parsed = [...byIdent.values()].sort((a, b) => a.title.localeCompare(b.title));
      setPages(parsed);

      const pubkeys = [...new Set(parsed.map((p) => p.pubkey))];
      const profs = await fetchProfiles(pubkeys);
      if (!cancelled) setProfiles(profs);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [addr]);

  const handleSave = async () => {
    if (!signer || !addr || !editTitle.trim()) return;
    setSaving(true);
    const slug = editTitle.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    try {
      const event = await signWith(signer, {
        kind: WIKI_PAGE,
        content: editContent,
        tags: [
          ["d", slug],
          ["a", addr],
          ["title", editTitle.trim()],
          ...(repoPubkey ? [["p", repoPubkey]] : []),
        ],
        created_at: Math.floor(Date.now() / 1000),
      });
      await Promise.allSettled(pool.publish(DEFAULT_RELAYS, event));
      toast("Page saved!", "success");
      const newPage: WikiPageEvent = {
        id: event.id,
        pubkey: userPubkey!,
        content: editContent,
        repoAddress: addr,
        identifier: slug,
        title: editTitle.trim(),
        createdAt: event.created_at,
      };
      setPages((prev) => {
        const filtered = prev.filter((p) => p.identifier !== slug);
        return [newPage, ...filtered];
      });
      setEditing(false);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p>Loading wiki...</p>
      </div>
    );
  }

  const activePage = pageSlug ? pages.find((p) => p.identifier === pageSlug) : null;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-3">
        <Link to={`/repo/${repoPubkey}/${identifier}`} className="text-sm text-accent hover:underline">
          &larr; Back to {identifier}
        </Link>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-48 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-secondary">Pages</h2>
            {signer && (
              <button
                onClick={() => { setEditing(true); setEditTitle(""); setEditContent(""); }}
                className="text-xs text-accent hover:underline bg-transparent border-0 cursor-pointer"
              >
                + New
              </button>
            )}
          </div>
          <div className="space-y-0.5">
            {pages.map((p) => (
              <Link
                key={p.identifier}
                to={`/repo/${repoPubkey}/${identifier}/wiki/${p.identifier}`}
                className={`block px-2 py-1 text-sm rounded no-underline hover:no-underline ${
                  pageSlug === p.identifier
                    ? "bg-accent/15 text-accent font-medium"
                    : "text-text-secondary hover:bg-bg-tertiary"
                }`}
              >
                {p.title}
              </Link>
            ))}
            {pages.length === 0 && (
              <p className="text-xs text-text-muted px-2">No pages yet</p>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="Box">
              <div className="Box-header py-2 px-4">
                <h2 className="text-sm font-semibold">{editTitle ? "Edit Page" : "New Page"}</h2>
              </div>
              <div className="p-4 space-y-3">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Page title"
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Page content (Markdown)"
                  rows={15}
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-y font-mono"
                />
                <div className="flex gap-2">
                  <button onClick={handleSave} disabled={saving || !editTitle.trim()} className="btn btn-primary">
                    {saving ? "Saving..." : "Save Page"}
                  </button>
                  <button onClick={() => setEditing(false)} className="btn">Cancel</button>
                </div>
              </div>
            </div>
          ) : activePage ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-semibold">{activePage.title}</h1>
                {signer && (
                  <button
                    onClick={() => { setEditing(true); setEditTitle(activePage.title); setEditContent(activePage.content); }}
                    className="btn btn-sm"
                  >
                    Edit
                  </button>
                )}
              </div>
              <div className="text-xs text-text-muted mb-4">
                Last updated by {profiles.get(activePage.pubkey)?.name ?? shortenKey(activePage.pubkey)} · {timeAgo(activePage.createdAt)}
              </div>
              <div className="border border-border rounded-lg p-6 bg-bg-primary">
                <MarkdownContent content={activePage.content} />
              </div>
            </div>
          ) : (
            <div className="Blankslate">
              <h2 className="text-lg font-semibold mb-2">Wiki</h2>
              <p className="text-text-muted">Select a page from the sidebar, or create a new one.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
