import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";
import { publishSnippet } from "../lib/nostr";
import { useRelays } from "../hooks/useRelays";

const LANGUAGES = [
  "", "javascript", "typescript", "python", "rust", "go", "java", "c", "cpp",
  "csharp", "ruby", "swift", "kotlin", "scala", "haskell", "elixir", "lua",
  "bash", "sql", "html", "css", "json", "yaml", "toml", "markdown", "solidity",
  "zig", "nim", "dart", "r",
];

export default function NewSnippetPage() {
  const { pubkey, signer } = useAuth();
  const { globalRelays } = useRelays();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("");
  const [description, setDescription] = useState("");
  const [license, setLicense] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  if (!pubkey || !signer) {
    return (
      <div className="text-center py-20 text-text-secondary">
        Please sign in to create a snippet.
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) { setError("Code content is required"); return; }
    setPublishing(true);
    setError("");
    try {
      const event = await publishSnippet(
        signer,
        {
          content: content,
          language: language || undefined,
          name: name || undefined,
          description: description || undefined,
          license: license || undefined,
        },
        globalRelays
      );
      toast("Snippet published!", "success");
      navigate(`/snippets/${event.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">New Code Snippet</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red/10 border border-red/30 rounded-md p-3 text-sm text-red">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-text-secondary block mb-1">Filename</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="hello-world.py"
              className="w-full bg-bg-secondary border border-border rounded-md px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent font-mono"
            />
          </div>
          <div>
            <label className="text-sm text-text-secondary block mb-1">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-bg-secondary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent cursor-pointer"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{l || "Auto-detect"}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm text-text-secondary block mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this code do?"
            className="w-full bg-bg-secondary border border-border rounded-md px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="text-sm text-text-secondary block mb-1">Code *</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste your code here..."
            className="w-full h-64 bg-bg-secondary border border-border rounded-md px-4 py-3 text-sm text-text-primary font-mono resize-y focus:outline-none focus:border-accent"
            spellCheck={false}
          />
        </div>

        <div>
          <label className="text-sm text-text-secondary block mb-1">License (SPDX)</label>
          <input
            type="text"
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            placeholder="MIT"
            className="w-full max-w-xs bg-bg-secondary border border-border rounded-md px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          />
        </div>

        <button type="submit" disabled={publishing || !content.trim()} className="btn btn-primary">
          {publishing ? "Publishing..." : "Publish Snippet"}
        </button>
      </form>
    </div>
  );
}
