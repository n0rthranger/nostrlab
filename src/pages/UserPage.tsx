import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  fetchReposByPubkey,
  fetchProfiles,
  fetchFollowing,
  fetchFollowers,
  fetchReactions,
  fetchRepos,
  pubkeyFromNpub,
  shortenKey,
} from "../lib/nostr";
import type { RepoAnnouncement, UserProfile } from "../types/nostr";
import RepoCard from "../components/RepoCard";
import FollowButton from "../components/FollowButton";
import ContributionGraph from "../components/ContributionGraph";
import { useAuth } from "../hooks/useAuth";

type Tab = "overview" | "repositories" | "stars";

export default function UserPage() {
  const { npubOrPubkey, tab } = useParams<{ npubOrPubkey: string; tab?: string }>();
  const { pubkey: authPubkey } = useAuth();
  const navigate = useNavigate();
  const [repos, setRepos] = useState<RepoAnnouncement[]>([]);
  const [starredRepos, setStarredRepos] = useState<RepoAnnouncement[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [starProfiles, setStarProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [followingCount, setFollowingCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [starsLoading, setStarsLoading] = useState(false);

  const activeTab: Tab = (tab === "repositories" || tab === "stars") ? tab : "overview";

  const resolvedPubkey = (() => {
    if (!npubOrPubkey) return "";
    try {
      return npubOrPubkey.startsWith("npub") ? pubkeyFromNpub(npubOrPubkey) : npubOrPubkey;
    } catch {
      return "";
    }
  })();

  useEffect(() => {
    if (!resolvedPubkey) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      const [repos, profiles, following, followers] = await Promise.all([
        fetchReposByPubkey(resolvedPubkey),
        fetchProfiles([resolvedPubkey]),
        fetchFollowing(resolvedPubkey),
        fetchFollowers(resolvedPubkey),
      ]);
      if (cancelled) return;
      setRepos(repos.sort((a, b) => b.createdAt - a.createdAt));
      setProfile(profiles.get(resolvedPubkey) ?? null);
      setFollowingCount(following.length);
      setFollowersCount(followers.length);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [resolvedPubkey]);

  // Load starred repos when stars tab is active
  useEffect(() => {
    if (activeTab !== "stars" || !resolvedPubkey) return;
    let cancelled = false;
    (async () => {
      setStarsLoading(true);

      // Fetch all reactions by this user on repo announcement events
      // We need to find repos this user has reacted to
      const allRepos = await fetchRepos();
      if (cancelled) return;
      const repoIds = allRepos.map((r) => r.id);
      // Batch fetch reactions for all repo IDs
      const reactions = await fetchReactions(repoIds);
      if (cancelled) return;
      const starredIds = new Set(
        reactions.filter((r) => r.pubkey === resolvedPubkey).map((r) => r.targetId)
      );
      const starred = allRepos.filter((r) => starredIds.has(r.id));
      setStarredRepos(starred);
      const pubkeys = [...new Set(starred.map((r) => r.pubkey))];
      if (pubkeys.length > 0) {
        const profs = await fetchProfiles(pubkeys);
        if (!cancelled) setStarProfiles(profs);
      }
      setStarsLoading(false);
    })();

    return () => { cancelled = true; };
  }, [activeTab, resolvedPubkey]);

  if (loading) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p>Loading profile...</p>
      </div>
    );
  }

  const pubkey = resolvedPubkey;
  const displayName = profile?.displayName ?? profile?.name ?? shortenKey(pubkey);
  const isOwnProfile = authPubkey === pubkey;

  const setTab = (t: Tab) => {
    if (t === "overview") navigate(`/user/${npubOrPubkey}`);
    else navigate(`/user/${npubOrPubkey}/${t}`);
  };

  return (
    <div className="animate-fadeIn">
      {/* Banner */}
      {profile?.banner && (
        <div className="h-40 rounded-xl overflow-hidden mb-4 -mt-2">
          <img src={profile.banner} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Profile header */}
      <div className="flex items-start gap-4 mb-8">
        {profile?.picture ? (
          <img
            src={profile.picture}
            alt=""
            className={`w-20 h-20 rounded-full border-4 border-bg-primary object-cover ${profile.banner ? "-mt-12" : ""}`}
          />
        ) : (
          <div className={`w-20 h-20 rounded-full bg-bg-tertiary border-4 border-bg-primary flex items-center justify-center text-3xl text-text-muted ${profile?.banner ? "-mt-12" : ""}`}>
            ?
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{displayName}</h1>
            {isOwnProfile ? (
              <Link
                to="/profile/edit"
                className="px-3 py-1 text-xs border border-border rounded-lg text-text-secondary hover:text-text-primary no-underline hover:no-underline hover:border-text-muted"
              >
                Edit profile
              </Link>
            ) : (
              <FollowButton targetPubkey={pubkey} />
            )}
          </div>
          {profile?.nip05 && (
            <p className="text-sm text-accent">{profile.nip05}</p>
          )}
          {profile?.about && (
            <p className="text-sm text-text-secondary mt-1">{profile.about}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-text-secondary">
              <strong className="text-text-primary">{followingCount}</strong> following
            </span>
            <span className="text-xs text-text-secondary">
              <strong className="text-text-primary">{followersCount}</strong> followers
            </span>
            <p className="text-xs font-mono text-text-muted">
              {shortenKey(pubkey)}
            </p>
            {profile?.lud16 && (
              <span className="text-xs text-orange flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                {profile.lud16}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="UnderlineNav mb-6">
        <button
          onClick={() => setTab("overview")}
          className={`UnderlineNav-item ${activeTab === "overview" ? "selected" : ""}`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.004-5.073-.002-2.253A2.25 2.25 0 0 0 5.003 2.5H1.5v9h3.757a3.75 3.75 0 0 1 1.994.574ZM8.755 4.75l-.004 7.322a3.752 3.752 0 0 1 1.992-.572H14.5v-9h-3.495a2.25 2.25 0 0 0-2.25 2.25Z"/></svg>
          Overview
        </button>
        <button
          onClick={() => setTab("repositories")}
          className={`UnderlineNav-item ${activeTab === "repositories" ? "selected" : ""}`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/></svg>
          Repositories
          <span className="Counter">{repos.length}</span>
        </button>
        <button
          onClick={() => setTab("stars")}
          className={`UnderlineNav-item ${activeTab === "stars" ? "selected" : ""}`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>
          Stars
          {activeTab === "stars" && <span className="Counter">{starredRepos.length}</span>}
        </button>
      </div>

      {/* Overview tab */}
      {activeTab === "overview" && (
        <>
          {/* Contribution graph */}
          <div className="mb-6">
            <ContributionGraph pubkey={pubkey} />
          </div>

          {/* Pinned repos */}
          {(() => {
            const pinnedKey = `pinned-repos-${pubkey}`;
            const pinned: string[] = (() => { try { return JSON.parse(localStorage.getItem(pinnedKey) || "[]"); } catch { return []; } })();
            const pinnedRepos = repos.filter((r) => pinned.includes(`${r.pubkey}:${r.identifier}`));
            if (pinnedRepos.length === 0) return null;
            return (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.456.734a1.75 1.75 0 0 1 2.826.504l.613 1.327a3.081 3.081 0 0 0 2.084 1.707l2.454.584c1.332.317 1.8 1.972.832 2.94L11.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06L10 11.06l-2.204 2.205c-.968.968-2.623.5-2.94-.832l-.584-2.454a3.081 3.081 0 0 0-1.707-2.084l-1.327-.613a1.75 1.75 0 0 1-.504-2.826Z"/>
                  </svg>
                  Pinned
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {pinnedRepos.map((repo) => (
                    <RepoCard key={`${repo.pubkey}:${repo.identifier}`} repo={repo} authorName={profile?.name} />
                  ))}
                </div>
              </div>
            );
          })()}

          <h2 className="text-lg font-semibold mb-4">
            Repositories ({repos.length})
          </h2>
          {repos.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border rounded-lg">
              <p className="text-text-muted">No repositories announced yet</p>
              {isOwnProfile && (
                <Link to="/new" className="text-sm text-accent mt-2 inline-block">
                  Announce your first repo
                </Link>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {repos.map((repo) => (
                <RepoCard
                  key={`${repo.pubkey}:${repo.identifier}`}
                  repo={repo}
                  authorName={profile?.name}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Repositories tab */}
      {activeTab === "repositories" && (
        <>
          {repos.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border rounded-lg">
              <p className="text-text-muted">No repositories announced yet</p>
              {isOwnProfile && (
                <Link to="/new" className="text-sm text-accent mt-2 inline-block">
                  Announce your first repo
                </Link>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {repos.map((repo) => (
                <RepoCard
                  key={`${repo.pubkey}:${repo.identifier}`}
                  repo={repo}
                  authorName={profile?.name}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Stars tab */}
      {activeTab === "stars" && (
        <>
          {starsLoading ? (
            <div className="text-center py-10 text-text-secondary">
              <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
              <p>Loading starred repositories...</p>
            </div>
          ) : starredRepos.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border rounded-lg">
              <p className="text-text-muted">No starred repositories yet</p>
              <Link to="/" className="text-sm text-accent mt-2 inline-block">
                Explore repositories
              </Link>
            </div>
          ) : (
            <div className="grid gap-3">
              {starredRepos.map((repo) => (
                <RepoCard
                  key={`${repo.pubkey}:${repo.identifier}`}
                  repo={repo}
                  authorName={starProfiles.get(repo.pubkey)?.name}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
