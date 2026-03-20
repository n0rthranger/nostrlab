import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchSnippetById, fetchProfiles, shortenKey, timeAgo } from "../lib/nostr";
import type { CodeSnippetEvent, UserProfile } from "../types/nostr";
import FileViewer from "../components/FileViewer";
import { useRelays } from "../hooks/useRelays";

export default function SnippetPage() {
  const { snippetId } = useParams<{ snippetId: string }>();
  const { globalRelays } = useRelays();
  const [snippet, setSnippet] = useState<CodeSnippetEvent | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!snippetId) return;
    let cancelled = false;
    fetchSnippetById(snippetId, globalRelays).then(async (s) => {
      if (cancelled) return;
      setSnippet(s);
      if (s) {
        const profs = await fetchProfiles([s.pubkey], globalRelays);
        if (!cancelled) setProfile(profs.get(s.pubkey) ?? null);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [snippetId, globalRelays]);

  if (loading) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p>Loading snippet...</p>
      </div>
    );
  }

  if (!snippet) {
    return <div className="text-center py-20 text-text-secondary">Snippet not found</div>;
  }

  const filename = snippet.name ?? `snippet.${snippet.extension ?? snippet.language ?? "txt"}`;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{snippet.name ?? "Untitled snippet"}</h1>
        <div className="flex items-center gap-3 mt-2 text-sm text-text-secondary">
          {profile?.picture && <img src={profile.picture} alt="" className="w-5 h-5 rounded-full" />}
          <span>{profile?.name ?? shortenKey(snippet.pubkey)}</span>
          <span>{timeAgo(snippet.createdAt)}</span>
          {snippet.language && (
            <span className="px-1.5 py-0 rounded bg-accent/15 text-accent text-xs font-mono">
              {snippet.language}
            </span>
          )}
          {snippet.license && (
            <span className="px-1.5 py-0 rounded bg-bg-tertiary text-text-muted text-xs">
              {snippet.license}
            </span>
          )}
          {snippet.runtime && (
            <span className="text-xs text-text-muted">{snippet.runtime}</span>
          )}
        </div>
        {snippet.description && (
          <p className="text-text-secondary mt-2">{snippet.description}</p>
        )}
      </div>

      <FileViewer content={snippet.content} filename={filename} />
    </div>
  );
}
