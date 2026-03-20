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
import { CHANGELOG } from "../types/nostr";
import type { ChangelogEntry, UserProfile } from "../types/nostr";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";
import MarkdownContent from "../components/MarkdownContent";

export default function ChangelogPage() {
  const { pubkey: repoPubkey, identifier } = useParams();
  const { pubkey: userPubkey, signer } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const addr = repoPubkey && identifier ? repoAddress(repoPubkey, identifier) : "";
  const isOwner = userPubkey === repoPubkey;

  useEffect(() => {
    if (!addr) return;
    let cancelled = false;

    pool.querySync(DEFAULT_RELAYS, { kinds: [CHANGELOG], "#a": [addr] }).then(async (events) => {
      if (cancelled) return;
      // Deduplicate by "d" tag (version), keep latest
      const byVersion = new Map<string, ChangelogEntry>();
      for (const e of events) {
        const ver = e.tags.find((t) => t[0] === "d")?.[1] ?? e.id;
        const existing = byVersion.get(ver);
        if (!existing || e.created_at > existing.createdAt) {
          byVersion.set(ver, {
            id: e.id,
            pubkey: e.pubkey,
            content: e.content,
            repoAddress: e.tags.find((t) => t[0] === "a")?.[1] ?? "",
            identifier: ver,
            title: e.tags.find((t) => t[0] === "title")?.[1] ?? ver,
            version: e.tags.find((t) => t[0] === "version")?.[1] ?? ver,
            createdAt: e.created_at,
          });
        }
      }
      const parsed = [...byVersion.values()].sort((a, b) => b.createdAt - a.createdAt);
      setEntries(parsed);

      const pubkeys = [...new Set(parsed.map((p) => p.pubkey))];
      if (pubkeys.length > 0) {
        const profs = await fetchProfiles(pubkeys);
        if (!cancelled) setProfiles(profs);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [addr]);

  const handlePublish = async () => {
    if (!signer || !addr || !version.trim() || !title.trim()) return;
    setSaving(true);
    try {
      const event = await signWith(signer, {
        kind: CHANGELOG,
        content,
        tags: [
          ["d", version.trim()],
          ["a", addr],
          ["title", title.trim()],
          ["version", version.trim()],
          ...(repoPubkey ? [["p", repoPubkey]] : []),
        ],
        created_at: Math.floor(Date.now() / 1000),
      });
      await Promise.allSettled(pool.publish(DEFAULT_RELAYS, event));
      toast("Release published!", "success");
      const newEntry: ChangelogEntry = {
        id: event.id,
        pubkey: userPubkey!,
        identifier: version.trim(),
        version: version.trim(),
        title: title.trim(),
        content: content.trim(),
        createdAt: event.created_at,
      };
      setEntries((prev) => [newEntry, ...prev]);
      setShowForm(false);
      setVersion("");
      setTitle("");
      setContent("");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to publish", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p>Loading changelog...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-3">
        <Link to={`/repo/${repoPubkey}/${identifier}`} className="text-sm text-accent hover:underline">
          &larr; Back to {identifier}
        </Link>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Changelog</h1>
        {isOwner && signer && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn btn-primary btn-sm"
          >
            New Release
          </button>
        )}
      </div>

      {showForm && (
        <div className="Box mb-6">
          <div className="Box-header py-2 px-4">
            <h2 className="text-sm font-semibold">New Release</h2>
          </div>
          <div className="p-4 space-y-3">
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="Version (e.g. v1.0.0)"
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Release title"
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Release notes (Markdown)"
              rows={10}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-y font-mono"
            />
            <div className="flex gap-2">
              <button
                onClick={handlePublish}
                disabled={saving || !version.trim() || !title.trim()}
                className="btn btn-primary"
              >
                {saving ? "Publishing..." : "Publish Release"}
              </button>
              <button onClick={() => setShowForm(false)} className="btn">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="Blankslate Box">
          <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted mx-auto mb-2">
            <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/>
          </svg>
          <p>No releases yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => {
            const profile = profiles.get(entry.pubkey);
            return (
              <div key={entry.id} className="Box">
                <div className="Box-header py-3 px-4 flex items-center gap-3">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-green shrink-0">
                    <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/>
                  </svg>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-text-primary">{entry.version}</span>
                    <span className="text-text-secondary ml-2">{entry.title}</span>
                  </div>
                  <div className="text-xs text-text-muted shrink-0">
                    {timeAgo(entry.createdAt)} by {profile?.name ?? shortenKey(entry.pubkey)}
                  </div>
                </div>
                {entry.content && (
                  <div className="p-4">
                    <MarkdownContent content={entry.content} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
