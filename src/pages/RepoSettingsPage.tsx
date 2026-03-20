import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";
import { fetchRepo, publishRepo, repoAddress, DEFAULT_RELAYS } from "../lib/nostr";
import { generateRepoKey } from "../lib/crypto";
import WebhookSettings from "../components/WebhookSettings";

export default function RepoSettingsPage() {
  const { pubkey: repoPubkey, identifier } = useParams();
  const { pubkey, signer } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [tags, setTags] = useState("");
  const [unlisted, setUnlisted] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [repoKey, setRepoKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!repoPubkey || !identifier) return;
    let cancelled = false;
    fetchRepo(repoPubkey, identifier).then((repo) => {
      if (cancelled || !repo) return;
      setName(repo.name);
      setDescription(repo.description);
      setCloneUrl(repo.cloneUrls[0] ?? "");
      setWebUrl(repo.webUrls[0] ?? "");
      setUnlisted(repo.tags.includes("unlisted"));
      setTags(repo.tags.filter((t) => t !== "unlisted").join(", "));
      setIsPrivate(repo.isPrivate);
      // Load stored encryption key from localStorage
      const addr = repoAddress(repoPubkey, identifier);
      const storedKey = localStorage.getItem(`nostr-repo-key:${addr}`);
      if (storedKey) setRepoKey(storedKey);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [repoPubkey, identifier]);

  if (!pubkey || !signer || pubkey !== repoPubkey) {
    return (
      <div className="Blankslate Box max-w-2xl mx-auto">
        <p>You don't have permission to manage this repository's settings.</p>
        <Link to={`/repo/${repoPubkey}/${identifier}`} className="btn btn-sm mt-4 no-underline hover:no-underline">
          Back to repository
        </Link>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signer || !identifier) return;
    setSaving(true);
    const repoTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (unlisted) repoTags.push("unlisted");
    try {
      await publishRepo(signer, {
        identifier,
        name: name.trim(),
        description: description.trim(),
        cloneUrls: cloneUrl.trim() ? [cloneUrl.trim()] : [],
        webUrls: webUrl.trim() ? [webUrl.trim()] : [],
        relays: DEFAULT_RELAYS,
        tags: repoTags,
        isPrivate,
      });
      toast("Settings saved!", "success");
      navigate(`/repo/${repoPubkey}/${identifier}`);
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
        <p>Loading settings...</p>
      </div>
    );
  }

  const inputClass = "w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-3">
        <Link to={`/repo/${repoPubkey}/${identifier}`} className="text-sm text-accent hover:underline">
          &larr; Back to {identifier}
        </Link>
      </div>

      <h1 className="text-2xl font-semibold mb-6">Repository Settings</h1>

      <form onSubmit={handleSave}>
        {/* General */}
        <div className="Box mb-6">
          <div className="Box-header py-2 px-4">
            <h2 className="text-sm font-semibold">General</h2>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-text-primary block mb-1.5">Repository name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-sm font-medium text-text-primary block mb-1.5">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${inputClass} resize-y`} />
            </div>
            <div>
              <label className="text-sm font-medium text-text-primary block mb-1.5">Tags</label>
              <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="rust, cli, nostr" className={inputClass} />
              <p className="text-xs text-text-muted mt-1">Comma-separated</p>
            </div>
          </div>
        </div>

        {/* Links */}
        <div className="Box mb-6">
          <div className="Box-header py-2 px-4">
            <h2 className="text-sm font-semibold">Links</h2>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-text-primary block mb-1.5">Git Clone URL</label>
              <input type="text" value={cloneUrl} onChange={(e) => setCloneUrl(e.target.value)} placeholder="https://github.com/user/repo.git" className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className="text-sm font-medium text-text-primary block mb-1.5">Web URL</label>
              <input type="text" value={webUrl} onChange={(e) => setWebUrl(e.target.value)} placeholder="https://github.com/user/repo" className={`${inputClass} font-mono`} />
            </div>
          </div>
        </div>

        {/* Visibility */}
        <div className="Box mb-6">
          <div className="Box-header py-2 px-4">
            <h2 className="text-sm font-semibold">Visibility</h2>
          </div>
          <div className="p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={unlisted} onChange={(e) => setUnlisted(e.target.checked)} className="accent-accent" />
              <div>
                <span className="text-sm font-medium text-text-primary">Unlisted</span>
                <p className="text-xs text-text-muted">Hide from Explore and search. Anyone with the direct link can still view it.</p>
              </div>
            </label>
          </div>
        </div>

        {/* Privacy — Encrypted Private Repo */}
        <div className="Box mb-6">
          <div className="Box-header py-2 px-4">
            <h2 className="text-sm font-semibold">Privacy</h2>
          </div>
          <div className="p-4 space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={async (e) => {
                  const checked = e.target.checked;
                  setIsPrivate(checked);
                  if (checked && !repoKey && repoPubkey && identifier) {
                    const newKey = await generateRepoKey();
                    setRepoKey(newKey);
                    const addr = repoAddress(repoPubkey!, identifier!);
                    localStorage.setItem(`nostr-repo-key:${addr}`, newKey);
                  }
                }}
                className="accent-accent"
              />
              <div>
                <span className="text-sm font-medium text-text-primary">Private repository</span>
                <p className="text-xs text-text-muted">Encrypt file blobs so only users with the decryption key can view code.</p>
              </div>
            </label>
            {isPrivate && repoKey && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-primary block">Encryption Key</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={repoKey}
                    className={`${inputClass} font-mono text-xs`}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(repoKey);
                      toast("Key copied to clipboard", "success");
                    }}
                    className="px-3 py-2 border border-border rounded-lg text-sm cursor-pointer bg-transparent text-text-secondary hover:text-text-primary hover:border-text-muted whitespace-nowrap"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-text-muted">
                  Share this key with authorized collaborators. They must enter it in the code browser to decrypt files.
                  This key is stored in your browser's localStorage.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 mb-8">
          <button type="submit" disabled={saving || !name.trim()} className="btn btn-primary">
            {saving ? "Saving..." : "Save changes"}
          </button>
          <button type="button" onClick={() => navigate(`/repo/${repoPubkey}/${identifier}`)} className="btn">Cancel</button>
        </div>
      </form>

      {/* Webhooks */}
      {repoPubkey && identifier && (
        <div className="Box mb-6">
          <div className="Box-header py-2 px-4">
            <h2 className="text-sm font-semibold">Integrations</h2>
          </div>
          <div className="p-4">
            <WebhookSettings repoAddress={repoAddress(repoPubkey, identifier)} />
          </div>
        </div>
      )}

      {/* Danger zone */}
      <div className="Box border-red/30 mb-8">
        <div className="Box-header py-2 px-4 bg-red/5">
          <h2 className="text-sm font-semibold text-red">Danger Zone</h2>
        </div>
        <div className="p-4">
          <p className="text-sm text-text-secondary mb-2">
            Nostr events are distributed across relays and cannot be permanently deleted.
            To "remove" a repository, you can mark it as unlisted and clear its description.
          </p>
          <p className="text-xs text-text-muted">
            Some relays may honor deletion requests (NIP-09), but this is not guaranteed.
          </p>
        </div>
      </div>
    </div>
  );
}
