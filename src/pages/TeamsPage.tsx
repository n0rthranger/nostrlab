import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  pool,
  DEFAULT_RELAYS,
  fetchProfiles,
  shortenKey,
  timeAgo,
  npubFromPubkey,
  signWith,
} from "../lib/nostr";
import { TEAM } from "../types/nostr";
import type { Team, TeamMember, UserProfile } from "../types/nostr";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";

export default function TeamsPage() {
  const { pubkey, signer } = useAuth();
  const { toast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberInput, setMemberInput] = useState("");

  useEffect(() => {
    if (!pubkey) { setLoading(false); return; }
    let cancelled = false;

    // Fetch teams where user is a member or creator
    pool.querySync(DEFAULT_RELAYS, {
      kinds: [TEAM],
      authors: [pubkey],
      limit: 50,
    }).then(async (ownEvents) => {
      // Also fetch teams that tag this user
      const taggedEvents = await pool.querySync(DEFAULT_RELAYS, {
        kinds: [TEAM],
        "#p": [pubkey],
        limit: 50,
      });

      if (cancelled) return;

      const allEvents = [...ownEvents, ...taggedEvents];
      // Deduplicate by d-tag + author
      const byKey = new Map<string, Team>();
      for (const e of allEvents) {
        const ident = e.tags.find((t) => t[0] === "d")?.[1] ?? e.id;
        const key = `${e.pubkey}:${ident}`;
        const existing = byKey.get(key);
        if (existing && e.created_at <= existing.createdAt) continue;

        let members: TeamMember[];
        let repos: string[];
        try {
          const data = JSON.parse(e.content);
          members = data.members ?? [];
          repos = data.repos ?? [];
        } catch {
          members = e.tags
            .filter((t) => t[0] === "p")
            .map((t) => ({ pubkey: t[1], role: (t[2] as TeamMember["role"]) ?? "member" }));
          repos = e.tags.filter((t) => t[0] === "a").map((t) => t[1]);
        }

        byKey.set(key, {
          id: e.id,
          pubkey: e.pubkey,
          identifier: ident,
          name: e.tags.find((t) => t[0] === "name")?.[1] ?? ident,
          description: e.tags.find((t) => t[0] === "description")?.[1] ?? "",
          members,
          repos,
          createdAt: e.created_at,
        });
      }

      const parsed = [...byKey.values()].sort((a, b) => b.createdAt - a.createdAt);
      setTeams(parsed);

      const allPubkeys = [...new Set(parsed.flatMap((t) => [t.pubkey, ...t.members.map((m) => m.pubkey)]))];
      if (allPubkeys.length > 0) {
        const profs = await fetchProfiles(allPubkeys);
        if (!cancelled) setProfiles(profs);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [pubkey]);

  const handleCreate = async () => {
    if (!signer || !pubkey || !name.trim()) return;
    setCreating(true);
    try {
      const slug = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const memberPubkeys = memberInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const members: TeamMember[] = [
        { pubkey, role: "owner" },
        ...memberPubkeys.map((pk) => ({ pubkey: pk, role: "member" as const })),
      ];

      const event = await signWith(signer, {
        kind: TEAM,
        content: JSON.stringify({ members, repos: [] }),
        tags: [
          ["d", slug],
          ["name", name.trim()],
          ["description", description.trim()],
          ...members.map((m) => ["p", m.pubkey, m.role]),
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      await Promise.allSettled(pool.publish(DEFAULT_RELAYS, event));

      // Add to local state immediately instead of reloading
      const newTeam: Team = {
        id: event.id,
        pubkey,
        identifier: slug,
        name: name.trim(),
        description: description.trim(),
        members,
        repos: [],
        createdAt: event.created_at,
      };
      setTeams((prev) => [newTeam, ...prev]);
      toast("Team created!", "success");
      setShowForm(false);
      setName("");
      setDescription("");
      setMemberInput("");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to create team", "error");
    } finally {
      setCreating(false);
    }
  };

  if (!pubkey) {
    return (
      <div className="text-center py-20">
        <p className="text-text-secondary mb-3">Sign in to manage teams.</p>
        <Link to="/login" className="btn btn-primary no-underline hover:no-underline">Sign in</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p>Loading teams...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Teams</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn btn-primary"
        >
          New Team
        </button>
      </div>

      {showForm && (
        <div className="Box mb-6">
          <div className="Box-header py-2 px-4">
            <h2 className="text-sm font-semibold">Create a team</h2>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Team name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Team"
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this team work on?"
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Members (comma-separated pubkeys)</label>
              <input
                type="text"
                value={memberInput}
                onChange={(e) => setMemberInput(e.target.value)}
                placeholder="pubkey1, pubkey2..."
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={creating || !name.trim()} className="btn btn-primary">
                {creating ? "Creating..." : "Create Team"}
              </button>
              <button onClick={() => setShowForm(false)} className="btn">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {teams.length === 0 ? (
        <div className="Blankslate Box">
          <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted mx-auto mb-2">
            <path d="M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4.001 4.001 0 0 0-6.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 4.6 8.049 3.5 3.5 0 0 1 2 5.5ZM5.5 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm5.5.5a.75.75 0 0 1 .75-.75A2.75 2.75 0 0 1 14.5 6.5a.75.75 0 0 1-1.5 0 1.25 1.25 0 0 0-1.25-1.25.75.75 0 0 1-.75-.75Zm.75 4a.75.75 0 0 1 .75.75v1h1a.75.75 0 0 1 0 1.5h-1v1a.75.75 0 0 1-1.5 0v-1h-1a.75.75 0 0 1 0-1.5h1v-1a.75.75 0 0 1 .75-.75Z"/>
          </svg>
          <p>No teams yet</p>
          <p className="text-xs text-text-muted mt-1">Create a team to organize collaborators</p>
        </div>
      ) : (
        <div className="space-y-3">
          {teams.map((team) => {
            const owner = profiles.get(team.pubkey);
            return (
              <div key={team.id} className="Box">
                <div className="Box-row">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-text-primary">{team.name}</h3>
                      {team.description && (
                        <p className="text-sm text-text-secondary mt-0.5">{team.description}</p>
                      )}
                      <div className="text-xs text-text-muted mt-1">
                        Created by {owner?.name ?? shortenKey(team.pubkey)} · {timeAgo(team.createdAt)}
                      </div>
                    </div>
                    <span className="text-xs text-text-muted bg-bg-tertiary px-2 py-1 rounded-full">
                      {team.members.length} member{team.members.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-3">
                    {team.members.slice(0, 8).map((m) => {
                      const prof = profiles.get(m.pubkey);
                      return prof?.picture ? (
                        <Link
                          key={m.pubkey}
                          to={`/user/${npubFromPubkey(m.pubkey)}`}
                          title={prof.name || shortenKey(m.pubkey)}
                        >
                          <img
                            src={prof.picture}
                            alt=""
                            className="w-7 h-7 rounded-full object-cover border-2 border-bg-primary -ml-1 first:ml-0"
                            referrerPolicy="no-referrer"
                          />
                        </Link>
                      ) : (
                        <Link
                          key={m.pubkey}
                          to={`/user/${npubFromPubkey(m.pubkey)}`}
                          className="w-7 h-7 rounded-full bg-bg-tertiary flex items-center justify-center text-[10px] text-text-muted font-bold border-2 border-bg-primary -ml-1 first:ml-0 no-underline"
                          title={shortenKey(m.pubkey)}
                        >
                          {(prof?.name ?? "?")[0].toUpperCase()}
                        </Link>
                      );
                    })}
                    {team.members.length > 8 && (
                      <span className="text-xs text-text-muted ml-1">+{team.members.length - 8}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
