import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useRelays } from "../hooks/useRelays";
import { fetchRepo, publishRepo, repoAddress, fetchRepoFiles, publishFileBlob, DEFAULT_RELAYS } from "../lib/nostr";
import type { RepoAnnouncement } from "../types/nostr";

export default function ForkPage() {
  const { pubkey: repoPubkey, identifier } = useParams();
  const { pubkey, signer } = useAuth();
  const { globalRelays } = useRelays();
  const navigate = useNavigate();
  const [upstream, setUpstream] = useState<RepoAnnouncement | null>(null);
  const [loading, setLoading] = useState(true);
  const [forkId, setForkId] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [copyProgress, setCopyProgress] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!repoPubkey || !identifier) return;
    let cancelled = false;
    fetchRepo(repoPubkey, identifier, globalRelays).then((repo) => {
      if (cancelled) return;
      setUpstream(repo);
      if (repo) {
        setForkId(repo.identifier);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [repoPubkey, identifier, globalRelays]);

  if (!pubkey || !signer) {
    return (
      <div className="text-center py-20 text-text-secondary">
        Please sign in to fork a repository.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p>Loading repository...</p>
      </div>
    );
  }

  if (!upstream || !repoPubkey || !identifier) {
    return <div className="text-center py-20 text-text-secondary">Repository not found</div>;
  }

  const handleFork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forkId.trim()) return;
    setPublishing(true);
    setError("");
    try {
      await publishRepo(
        signer,
        {
          identifier: forkId,
          name: upstream.name,
          description: upstream.description,
          cloneUrls: cloneUrl.trim() ? [cloneUrl.trim()] : upstream.cloneUrls,
          webUrls: upstream.webUrls,
          relays: globalRelays.length > 0 ? globalRelays : DEFAULT_RELAYS,
          tags: upstream.tags,
          isFork: true,
          upstreamAddress: repoAddress(repoPubkey, identifier),
        },
        globalRelays
      );
      // Copy file blobs from upstream to fork
      const upstreamAddr = repoAddress(repoPubkey, identifier);
      const upstreamFiles = await fetchRepoFiles(upstreamAddr);
      const forkAddr = repoAddress(pubkey, forkId);
      for (let i = 0; i < upstreamFiles.length; i++) {
        const file = upstreamFiles[i];
        setCopyProgress(`Copying files... ${i + 1}/${upstreamFiles.length}`);
        await publishFileBlob(signer, {
          repoAddress: forkAddr,
          repoPubkey: pubkey,
          filePath: file.filePath,
          content: file.content,
          mimeType: file.mimeType,
        });
      }
      setCopyProgress("");
      navigate(`/repo/${pubkey}/${forkId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to publish fork");
    } finally {
      setPublishing(false);
      setCopyProgress("");
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-4">
        <Link
          to={`/repo/${repoPubkey}/${identifier}`}
          className="text-sm text-text-secondary hover:text-accent"
        >
          &larr; Back to {upstream.name}
        </Link>
      </div>

      <h1 className="text-2xl font-semibold mb-2">Fork {upstream.name}</h1>
      <p className="text-text-secondary text-sm mb-6">
        Create a personal fork announcement that references the upstream repository.
      </p>

      <form onSubmit={handleFork} className="space-y-4">
        {error && (
          <div className="bg-red/10 border border-red/30 rounded-md p-3 text-sm text-red">{error}</div>
        )}

        <div className="border border-border rounded-lg p-4 bg-bg-secondary">
          <div className="text-sm text-text-muted mb-1">Forking from</div>
          <div className="font-medium text-accent">{upstream.name}</div>
          <div className="text-xs text-text-muted font-mono mt-1">
            {repoAddress(repoPubkey, identifier)}
          </div>
        </div>

        <div>
          <label className="text-sm text-text-secondary block mb-1">Fork Identifier</label>
          <input
            type="text"
            value={forkId}
            onChange={(e) => setForkId(e.target.value)}
            className="w-full bg-bg-secondary border border-border rounded-md px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent font-mono"
          />
        </div>

        <div>
          <label className="text-sm text-text-secondary block mb-1">Your Fork Clone URL (optional)</label>
          <input
            type="text"
            value={cloneUrl}
            onChange={(e) => setCloneUrl(e.target.value)}
            placeholder="https://your-server.com/fork.git"
            className="w-full bg-bg-secondary border border-border rounded-md px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          />
          <p className="text-xs text-text-muted mt-1">
            Leave empty to keep the upstream clone URL
          </p>
        </div>

        <button
          type="submit"
          disabled={publishing || !forkId.trim()}
          className="px-6 py-2.5 bg-green text-white rounded-md font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {publishing ? (copyProgress || "Publishing...") : "Create Fork"}
        </button>
      </form>
    </div>
  );
}
