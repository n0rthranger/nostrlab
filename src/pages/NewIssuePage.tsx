import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";
import { publishIssue, repoAddress } from "../lib/nostr";
import MarkdownEditor from "../components/MarkdownEditor";

const LABEL_PRESETS = ["bug", "enhancement", "help wanted", "question", "documentation", "good first issue"];

const ISSUE_TEMPLATES = [
  {
    name: "Bug Report",
    subject: "[Bug] ",
    content: `## Description
A clear description of the bug.

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
What you expected to happen.

## Actual Behavior
What actually happened.

## Environment
- OS:
- Version:
`,
    labels: ["bug"],
  },
  {
    name: "Feature Request",
    subject: "[Feature] ",
    content: `## Problem
A clear description of the problem this feature would solve.

## Proposed Solution
Describe the solution you'd like.

## Alternatives Considered
Any alternative solutions or features you've considered.

## Additional Context
Any other context or screenshots.
`,
    labels: ["enhancement"],
  },
  {
    name: "Question",
    subject: "[Question] ",
    content: `## Question
What would you like to know?

## Context
Any relevant context that might help answer the question.
`,
    labels: ["question"],
  },
];

export default function NewIssuePage() {
  const { pubkey: repoPubkey, identifier } = useParams();
  const { pubkey, signer } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [customLabel, setCustomLabel] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  if (!pubkey || !signer) {
    return (
      <div className="text-center py-20">
        <p className="text-text-secondary mb-3">Sign in to create an issue</p>
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
    if (!subject.trim() || !repoPubkey || !identifier) return;
    setPublishing(true);
    setError("");
    try {
      const event = await publishIssue(signer, {
        repoAddress: repoAddress(repoPubkey, identifier),
        repoPubkey,
        subject: subject.trim(),
        content: content.trim(),
        labels: selectedLabels,
      });
      toast("Issue created!", "success");
      navigate(`/repo/${repoPubkey}/${identifier}/issues/${event.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to publish issue");
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
      <h1 className="text-2xl font-semibold mb-6">New Issue</h1>

      {/* Template picker */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-text-secondary">Template:</span>
        <button
          type="button"
          onClick={() => { setSubject(""); setContent(""); setSelectedLabels([]); }}
          className="text-xs px-2.5 py-1 rounded-full cursor-pointer border bg-transparent text-text-secondary border-border hover:border-text-muted"
        >
          Blank
        </button>
        {ISSUE_TEMPLATES.map((tpl) => (
          <button
            key={tpl.name}
            type="button"
            onClick={() => { setSubject(tpl.subject); setContent(tpl.content); setSelectedLabels(tpl.labels); }}
            className="text-xs px-2.5 py-1 rounded-full cursor-pointer border bg-transparent text-text-secondary border-border hover:border-accent hover:text-accent"
          >
            {tpl.name}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-sm text-red flex items-start gap-2">
            <span className="shrink-0">!</span>
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-auto text-red/50 hover:text-red bg-transparent border-0 cursor-pointer">x</button>
          </div>
        )}

        <div>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Issue title"
            className="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary text-lg placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        <MarkdownEditor
          value={content}
          onChange={setContent}
          placeholder="Describe the issue (Markdown supported)"
          minHeight="h-48"
        />

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

        <div className="flex gap-3">
          <button type="submit" disabled={publishing || !subject.trim()} className="btn btn-primary">
            {publishing ? "Publishing..." : "Submit Issue"}
          </button>
          <button type="button" onClick={() => navigate(`/repo/${repoPubkey}/${identifier}`)} className="btn">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
