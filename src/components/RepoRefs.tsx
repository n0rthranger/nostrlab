import type { RepoState } from "../types/nostr";

interface Props {
  repoState: RepoState | null;
}

export default function RepoRefs({ repoState }: Props) {
  if (!repoState) return null;

  const headRef = repoState.head?.replace("ref: ", "");
  const branches = Object.entries(repoState.refs)
    .filter(([k]) => k.startsWith("refs/heads/"))
    .map(([k, v]) => ({ name: k.replace("refs/heads/", ""), commit: v, isHead: k === headRef }));
  const tags = Object.entries(repoState.refs)
    .filter(([k]) => k.startsWith("refs/tags/"))
    .map(([k, v]) => ({ name: k.replace("refs/tags/", ""), commit: v }));

  if (branches.length === 0 && tags.length === 0) return null;

  return (
    <div className="border border-border rounded-lg p-4 bg-bg-secondary">
      {branches.length > 0 && (
        <div className="mb-3">
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <span className="text-text-muted">⎇</span> Branches ({branches.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {branches.map((b) => (
              <span
                key={b.name}
                className={`inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded ${
                  b.isHead ? "bg-green/15 text-green" : "bg-bg-tertiary text-text-secondary"
                }`}
              >
                {b.isHead && <span title="HEAD">●</span>}
                {b.name}
                <span className="text-text-muted">{b.commit.slice(0, 7)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {tags.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <span className="text-text-muted">🏷</span> Tags ({tags.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span
                key={t.name}
                className="inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded bg-orange/15 text-orange"
              >
                {t.name}
                <span className="text-text-muted">{t.commit.slice(0, 7)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
