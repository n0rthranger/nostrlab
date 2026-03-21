import { useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";
import { publishPullRequest, publishBountyClaim, repoAddress } from "../lib/nostr";
import MarkdownEditor from "../components/MarkdownEditor";

const LABEL_PRESETS = ["bugfix", "feature", "refactor", "docs", "tests", "breaking-change"];

export default function NewPullRequestPage() {
  const { pubkey: repoPubkey, identifier } = useParams();
  const [searchParams] = useSearchParams();
  const bountyId = searchParams.get("bounty") ?? undefined;
  const bountyPubkey = searchParams.get("bountyPubkey") ?? undefined;
  const { pubkey, signer } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [branchName, setBranchName] = useState("");
  const [commitId, setCommitId] = useState("");
  const [mergeBase, setMergeBase] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [customLabel, setCustomLabel] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!pubkey || !signer) {
    return (
      <div className="text-center py-20">
        <p className="text-text-secondary mb-3">Sign in to open a pull request</p>
        <Link to="/login" className="btn btn-primary no-underline hover:no-underline">
          Sign in
        </Link>
      </div>
    );
  }

  const toggleLabel = (label: string) => {
    setSelectedLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const addCustomLabel = () => {
    const l = customLabel.trim();
    if (l && !selectedLabels.includes(l)) {
      setSelectedLabels([...selectedLabels, l]);
      setCustomLabel("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !cloneUrl.trim() || !branchName.trim() || !repoPubkey || !identifier) return;
    setPublishing(true);
    setError("");
    try {
      const addr = repoAddress(repoPubkey, identifier);
      const event = await publishPullRequest(signer, {
        repoAddress: addr,
        repoPubkey,
        subject: subject.trim(),
        content: description.trim(),
        cloneUrl: cloneUrl.trim(),
        branchName: branchName.trim(),
        commitId: commitId.trim() || undefined,
        mergeBase: mergeBase.trim() || undefined,
        labels: selectedLabels.length > 0 ? selectedLabels : undefined,
        bountyId,
      });
      // Auto-claim the bounty if this PR is linked to one
      if (bountyId && bountyPubkey) {
        try {
          await publishBountyClaim(signer, {
            bountyId,
            bountyPubkey,
            repoAddress: addr,
            content: `Opened PR: ${subject.trim()}`,
            patchOrPrId: event.id,
          });
        } catch { /* claim is best-effort */ }
      }
      toast(bountyId ? "Pull request opened & bounty claimed!" : "Pull request opened!", "success");
      navigate(`/repo/${repoPubkey}/${identifier}/prs/${event.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to publish pull request");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto animate-fadeIn">
      <div className="mb-4">
        <Link
          to={`/repo/${repoPubkey}/${identifier}`}
          className="text-sm text-text-secondary hover:text-accent"
        >
          &larr; Back to {identifier}
        </Link>
      </div>
      <h1 className="text-2xl font-semibold mb-6">Open Pull Request</h1>

      {bountyId && (
        <div className="bg-orange/10 border border-orange/30 rounded-lg p-3 mb-6 flex items-center gap-2 text-sm">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-orange shrink-0">
            <path d="M9.504 1.132a.75.75 0 0 1 .37.98L7.752 7h4.498a.75.75 0 0 1 .58 1.228l-6 7.25a.75.75 0 0 1-1.334-.58L7.248 9H2.75a.75.75 0 0 1-.58-1.228l6-7.25a.75.75 0 0 1 1.334.61Z" />
          </svg>
          <span className="text-orange">This PR will be linked to a bounty. Submitting will automatically claim the bounty.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-sm text-red flex items-start gap-2">
            <span className="shrink-0">!</span>
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-auto text-red/50 hover:text-red bg-transparent border-0 cursor-pointer">x</button>
          </div>
        )}

        {/* Title */}
        <div>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Pull request title"
            className="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary text-lg placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        {/* Branch info */}
        <div className="border border-border rounded-xl bg-bg-secondary p-4 space-y-3">
          <label className="text-sm text-text-secondary font-medium block">Source branch</label>
          <p className="text-xs text-text-muted -mt-2">
            The clone URL and branch where your changes live. Reviewers will use this to fetch your code.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-text-muted block mb-1">Clone URL</label>
              <input
                type="text"
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                placeholder="https://git.example.com/you/repo.git"
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Branch</label>
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="fix/my-branch"
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent font-mono"
              />
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-sm text-text-secondary font-medium block mb-2">Description</label>
          <MarkdownEditor
            value={description}
            onChange={setDescription}
            placeholder="Describe your changes (Markdown supported). You can include a diff here too."
            minHeight="h-40"
          />
        </div>

        {/* Labels */}
        <div className="border border-border rounded-xl bg-bg-secondary p-4">
          <label className="text-sm text-text-secondary block mb-2 font-medium">Labels</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {LABEL_PRESETS.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => toggleLabel(label)}
                className={`text-xs px-2.5 py-1 rounded-full cursor-pointer border ${
                  selectedLabels.includes(label)
                    ? "bg-accent/15 text-accent border-accent/30"
                    : "bg-transparent text-text-secondary border-border hover:border-text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="Add custom label..."
              className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomLabel())}
            />
            <button
              type="button"
              onClick={addCustomLabel}
              disabled={!customLabel.trim()}
              className="px-3 py-1.5 text-sm bg-bg-tertiary text-text-primary rounded-lg border border-border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:border-text-muted"
            >
              Add
            </button>
          </div>
          {selectedLabels.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {selectedLabels.map((l) => (
                <span key={l} className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent flex items-center gap-1">
                  {l}
                  <button
                    type="button"
                    onClick={() => toggleLabel(l)}
                    className="text-accent/50 hover:text-accent bg-transparent border-0 cursor-pointer text-xs"
                  >x</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Advanced options */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-text-secondary hover:text-text-primary bg-transparent border-0 cursor-pointer flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`}>
              <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
            </svg>
            Advanced options
          </button>
          {showAdvanced && (
            <div className="mt-3 border border-border rounded-xl bg-bg-secondary p-4 space-y-3">
              <div>
                <label className="text-sm text-text-secondary block mb-1">Head commit hash</label>
                <input
                  type="text"
                  value={commitId}
                  onChange={(e) => setCommitId(e.target.value)}
                  placeholder="abc123def456..."
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-1.5 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-sm text-text-secondary block mb-1">Merge base commit</label>
                <p className="text-xs text-text-muted mb-1">The common ancestor between your branch and the target branch.</p>
                <input
                  type="text"
                  value={mergeBase}
                  onChange={(e) => setMergeBase(e.target.value)}
                  placeholder="789abc012def..."
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-1.5 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={publishing || !subject.trim() || !cloneUrl.trim() || !branchName.trim()} className="btn btn-primary">
            {publishing ? "Publishing..." : "Open Pull Request"}
          </button>
          <button type="button" onClick={() => navigate(`/repo/${repoPubkey}/${identifier}`)} className="btn">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
