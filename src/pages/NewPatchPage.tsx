import { useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";
import { publishPatch, repoAddress } from "../lib/nostr";
import MarkdownEditor from "../components/MarkdownEditor";

export default function NewPatchPage() {
  const { pubkey: repoPubkey, identifier } = useParams();
  const { pubkey, signer } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [diff, setDiff] = useState("");
  const [commitId, setCommitId] = useState("");
  const [parentCommitId, setParentCommitId] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!pubkey || !signer) {
    return (
      <div className="text-center py-20">
        <p className="text-text-secondary mb-3">Sign in to submit a patch</p>
        <Link to="/login" className="btn btn-primary no-underline hover:no-underline">
          Sign in
        </Link>
      </div>
    );
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setDiff(text);
      // Try to extract subject from patch file
      const subjectLine = text.split("\n").find((l) => l.startsWith("Subject:"));
      if (subjectLine && !subject) {
        setSubject(subjectLine.replace("Subject: ", "").replace(/\[PATCH[^\]]*\]\s*/, "").trim());
      }
    };
    reader.readAsText(file);
  };

  const buildPatchContent = (): string => {
    // Build git format-patch style content
    const lines: string[] = [];
    lines.push(`Subject: [PATCH] ${subject.trim()}`);
    lines.push("");
    if (description.trim()) {
      lines.push(description.trim());
      lines.push("");
    }
    lines.push("---");
    lines.push("");
    lines.push(diff.trim());
    return lines.join("\n");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !diff.trim() || !repoPubkey || !identifier) return;
    setPublishing(true);
    setError("");
    try {
      const event = await publishPatch(signer, {
        repoAddress: repoAddress(repoPubkey, identifier),
        repoPubkey,
        content: buildPatchContent(),
        commitId: commitId.trim() || undefined,
        parentCommitId: parentCommitId.trim() || undefined,
      });
      toast("Patch submitted!", "success");
      navigate(`/repo/${repoPubkey}/${identifier}/patches/${event.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to publish patch");
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
      <h1 className="text-2xl font-semibold mb-6">Submit Patch</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-sm text-red flex items-start gap-2">
            <span className="shrink-0">!</span>
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-auto text-red/50 hover:text-red bg-transparent border-0 cursor-pointer">x</button>
          </div>
        )}

        {/* Subject */}
        <div>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Patch title (e.g. Fix buffer overflow in parser)"
            className="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary text-lg placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        {/* Description */}
        <MarkdownEditor
          value={description}
          onChange={setDescription}
          placeholder="Describe the changes (optional, Markdown supported)"
          minHeight="h-28"
        />

        {/* Diff input */}
        <div className="border border-border rounded-xl bg-bg-secondary p-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm text-text-secondary font-medium">Diff / Patch content</label>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".patch,.diff,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-sm"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-8.5C1 2.784 1.784 2 2.75 2h6.5c.966 0 1.75.784 1.75 1.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.25.25 0 0 0-.25-.25h-6.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 11.25 14Z" />
                  <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 0 1-1.06-1.06l4-4a.75.75 0 0 1 1.06 0Z" />
                  <path d="M14.5 1.75a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.94l-4.47 4.47a.75.75 0 0 0 1.06 1.06L13.25 4.5v1.75a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.25-.56Z" />
                </svg>
                Upload .patch file
              </button>
            </div>
          </div>
          <p className="text-xs text-text-muted mb-3">
            Paste the output of <code className="text-cyan">git diff</code> or <code className="text-cyan">git format-patch</code>, or upload a <code>.patch</code> file.
          </p>
          <textarea
            value={diff}
            onChange={(e) => setDiff(e.target.value)}
            placeholder={`diff --git a/file.txt b/file.txt\nindex abc123..def456 100644\n--- a/file.txt\n+++ b/file.txt\n@@ -1,3 +1,4 @@\n existing line\n+added line\n another line`}
            className="w-full bg-bg-primary border border-border rounded-lg px-4 py-3 text-text-primary font-mono text-xs placeholder:text-text-muted focus:outline-none focus:border-accent resize-y"
            style={{ minHeight: "200px" }}
            spellCheck={false}
          />
          {diff && (
            <div className="mt-2 text-xs text-text-muted">
              {diff.split("\n").length} lines, {diff.length} characters
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
                <label className="text-sm text-text-secondary block mb-1">Commit hash</label>
                <input
                  type="text"
                  value={commitId}
                  onChange={(e) => setCommitId(e.target.value)}
                  placeholder="abc123def456..."
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-1.5 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-sm text-text-secondary block mb-1">Parent commit hash</label>
                <input
                  type="text"
                  value={parentCommitId}
                  onChange={(e) => setParentCommitId(e.target.value)}
                  placeholder="789abc012def..."
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-1.5 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={publishing || !subject.trim() || !diff.trim()} className="btn btn-primary">
            {publishing ? "Publishing..." : "Submit Patch"}
          </button>
          <button type="button" onClick={() => navigate(`/repo/${repoPubkey}/${identifier}`)} className="btn">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
