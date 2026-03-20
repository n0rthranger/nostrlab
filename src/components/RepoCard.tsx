import { Link } from "react-router-dom";
import type { RepoAnnouncement } from "../types/nostr";
import { shortenKey, timeAgo } from "../lib/nostr";

interface Props {
  repo: RepoAnnouncement;
  authorName?: string;
}

export default function RepoCard({ repo, authorName }: Props) {
  const displayAuthor = authorName ?? shortenKey(repo.pubkey);

  return (
    <div className="Box-row flex items-start justify-between gap-3 py-5 px-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 mb-1.5">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-accent/50 shrink-0">
            <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
          </svg>
          <Link
            to={`/repo/${repo.pubkey}/${repo.identifier}`}
            className="text-accent font-semibold hover:underline"
          >
            <span className="text-text-secondary font-normal">{displayAuthor} / </span>
            {repo.name}
          </Link>
          {repo.isPersonalFork && (
            <span className="Label text-[10px] bg-orange/15 text-orange border-orange/30">fork</span>
          )}
        </div>
        {repo.description && (
          <p className="text-text-secondary text-sm mt-1 mb-2 line-clamp-2">{repo.description}</p>
        )}
        <div className="flex items-center gap-3 flex-wrap text-xs text-text-muted">
          {repo.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="Label bg-accent/10 text-accent border-accent/20"
            >
              {tag}
            </span>
          ))}
          <span>{timeAgo(repo.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}
