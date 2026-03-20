import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  pool,
  fetchProfiles,
  fetchIssues,
  fetchStatuses,
  shortenKey,
  timeAgo,
  repoAddress,
  signWith,
  DEFAULT_RELAYS,
} from "../lib/nostr";
import { PROJECT_BOARD, STATUS_OPEN } from "../types/nostr";
import type {
  ProjectBoard,
  BoardColumn,
  IssueEvent,
  StatusEvent,
  UserProfile,
  StatusKind,
} from "../types/nostr";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";
import StatusBadge from "../components/StatusBadge";

export default function ProjectBoardPage() {
  const { pubkey: repoPubkey, identifier, boardId } = useParams();
  const { signer, pubkey: authPubkey } = useAuth();
  const { toast } = useToast();
  const [boards, setBoards] = useState<ProjectBoard[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<ProjectBoard | null>(null);
  const [issues, setIssues] = useState<IssueEvent[]>([]);
  const [statuses, setStatuses] = useState<StatusEvent[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);

  // New board form state
  const [showNewForm, setShowNewForm] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newColumnNames, setNewColumnNames] = useState("To Do, In Progress, Done");
  const [creating, setCreating] = useState(false);

  const addr = repoPubkey && identifier ? repoAddress(repoPubkey, identifier) : "";

  useEffect(() => {
    if (!addr) return;
    let cancelled = false;

    const load = async () => {
      const [boardEvents, repoIssues] = await Promise.all([
        pool.querySync(DEFAULT_RELAYS, { kinds: [PROJECT_BOARD], "#a": [addr] }),
        fetchIssues(addr, DEFAULT_RELAYS),
      ]);

      if (cancelled) return;

      const parsed: ProjectBoard[] = boardEvents.map((e) => {
        let columns: BoardColumn[] = [];
        try {
          const content = JSON.parse(e.content);
          columns = content.columns ?? [];
        } catch {
          // ignore parse errors
        }
        return {
          id: e.id,
          pubkey: e.pubkey,
          identifier: e.tags.find((t) => t[0] === "d")?.[1] ?? "",
          name: e.tags.find((t) => t[0] === "name")?.[1] ?? "Untitled Board",
          columns,
          repoAddress: e.tags.find((t) => t[0] === "a")?.[1] ?? "",
          createdAt: e.created_at,
        };
      }).sort((a, b) => b.createdAt - a.createdAt);

      setBoards(parsed);
      setIssues(repoIssues);

      // Select board if boardId is specified
      if (boardId) {
        const match = parsed.find((b) => b.id === boardId || b.identifier === boardId);
        if (match) setSelectedBoard(match);
      }

      // Fetch statuses for all issues
      const issueIds = repoIssues.map((i) => i.id);
      if (issueIds.length > 0) {
        const sts = await fetchStatuses(issueIds, DEFAULT_RELAYS);
        if (!cancelled) setStatuses(sts);
      }

      // Fetch profiles
      const pubkeys = [
        ...new Set([
          ...parsed.map((b) => b.pubkey),
          ...repoIssues.map((i) => i.pubkey),
        ]),
      ];
      if (pubkeys.length > 0) {
        const profs = await fetchProfiles(pubkeys, DEFAULT_RELAYS);
        if (!cancelled) setProfiles(profs);
      }

      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [addr, boardId]);

  const getLatestStatus = (targetId: string): StatusKind => {
    const relevant = statuses
      .filter((s) => s.targetId === targetId)
      .sort((a, b) => b.createdAt - a.createdAt);
    return relevant.length > 0 ? relevant[0].kind : STATUS_OPEN;
  };

  const getIssueById = (id: string): IssueEvent | undefined => {
    return issues.find((i) => i.id === id);
  };

  const handleCreateBoard = async () => {
    if (!signer || !addr || !newBoardName.trim()) return;
    setCreating(true);
    try {
      const columns: BoardColumn[] = newColumnNames
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n.length > 0)
        .map((name) => ({ name, issueIds: [] }));

      if (columns.length === 0) {
        toast("Add at least one column", "error");
        setCreating(false);
        return;
      }

      const boardIdentifier = newBoardName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const event = await signWith(signer, {
        kind: PROJECT_BOARD,
        content: JSON.stringify({ columns }),
        tags: [
          ["d", boardIdentifier],
          ["a", addr],
          ["name", newBoardName.trim()],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      await Promise.allSettled(pool.publish(DEFAULT_RELAYS, event));
      toast("Board created!", "success");
      const newBoard: ProjectBoard = {
        id: event.id,
        pubkey: authPubkey!,
        identifier: boardIdentifier,
        name: newBoardName.trim(),
        columns,
        repoAddress: addr,
        createdAt: event.created_at,
      };
      setBoards((prev) => [newBoard, ...prev]);
      setNewBoardName("");
      setNewColumnNames("To Do, In Progress, Done");
      setShowNewForm(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create board";
      toast(message, "error");
    } finally {
      setCreating(false);
    }
  };

  const handleMoveIssue = async (board: ProjectBoard, issueId: string, fromColIdx: number, toColIdx: number) => {
    if (!signer || fromColIdx === toColIdx) return;

    const updatedColumns = board.columns.map((col, idx) => {
      if (idx === fromColIdx) {
        return { ...col, issueIds: col.issueIds.filter((id) => id !== issueId) };
      }
      if (idx === toColIdx) {
        return { ...col, issueIds: [...col.issueIds, issueId] };
      }
      return col;
    });

    try {
      const event = await signWith(signer, {
        kind: PROJECT_BOARD,
        content: JSON.stringify({ columns: updatedColumns }),
        tags: [
          ["d", board.identifier],
          ["a", addr],
          ["name", board.name],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      await Promise.allSettled(pool.publish(DEFAULT_RELAYS, event));
      setSelectedBoard({ ...board, columns: updatedColumns });
      toast("Issue moved!", "success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to move issue";
      toast(message, "error");
    }
  };

  const handleAddIssueToColumn = async (board: ProjectBoard, issueId: string, colIdx: number) => {
    if (!signer) return;

    // Check if the issue is already on the board somewhere
    const alreadyOn = board.columns.some((col) => col.issueIds.includes(issueId));
    if (alreadyOn) {
      toast("Issue is already on this board", "error");
      return;
    }

    const updatedColumns = board.columns.map((col, idx) => {
      if (idx === colIdx) {
        return { ...col, issueIds: [...col.issueIds, issueId] };
      }
      return col;
    });

    try {
      const event = await signWith(signer, {
        kind: PROJECT_BOARD,
        content: JSON.stringify({ columns: updatedColumns }),
        tags: [
          ["d", board.identifier],
          ["a", addr],
          ["name", board.name],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      await Promise.allSettled(pool.publish(DEFAULT_RELAYS, event));
      setSelectedBoard({ ...board, columns: updatedColumns });
      toast("Issue added to column!", "success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add issue";
      toast(message, "error");
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p>Loading boards...</p>
      </div>
    );
  }

  // Board detail view
  if (selectedBoard) {
    const unassignedIssues = issues.filter(
      (issue) => !selectedBoard.columns.some((col) => col.issueIds.includes(issue.id))
    );

    return (
      <div className="max-w-full mx-auto">
        <div className="mb-3 flex items-center gap-2">
          <Link to={`/repo/${repoPubkey}/${identifier}`} className="text-sm text-accent hover:underline">
            {identifier}
          </Link>
          <span className="text-text-muted">/</span>
          <Link to={`/repo/${repoPubkey}/${identifier}/boards`} className="text-sm text-accent hover:underline">
            Boards
          </Link>
          <span className="text-text-muted">/</span>
          <span className="text-sm text-text-primary font-medium">{selectedBoard.name}</span>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">{selectedBoard.name}</h1>
          <div className="text-xs text-text-muted">
            by {profiles.get(selectedBoard.pubkey)?.name ?? shortenKey(selectedBoard.pubkey)}
            {" · "}{timeAgo(selectedBoard.createdAt)}
          </div>
        </div>

        {/* Kanban columns */}
        <div className="flex gap-4 overflow-x-auto pb-4">
          {selectedBoard.columns.map((col, colIdx) => (
            <div key={col.name} className="min-w-[280px] max-w-[320px] flex-shrink-0">
              <div className="Box">
                <div className="Box-header py-2 px-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{col.name}</h3>
                  <span className="Counter">{col.issueIds.length}</span>
                </div>
                <div className="p-2 space-y-2 min-h-[100px]">
                  {col.issueIds.map((issueId) => {
                    const issue = getIssueById(issueId);
                    if (!issue) return (
                      <div key={issueId} className="p-2 rounded border border-border bg-bg-primary text-xs text-text-muted">
                        Issue not found
                      </div>
                    );
                    const status = getLatestStatus(issue.id);
                    return (
                      <div key={issueId} className="p-3 rounded border border-border bg-bg-primary">
                        <div className="flex items-start gap-2 mb-2">
                          <StatusBadge kind={status} className="mt-0.5 shrink-0" />
                          <Link
                            to={`/repo/${repoPubkey}/${identifier}/issues/${issue.id}`}
                            className="text-sm text-text-primary font-medium hover:text-accent no-underline"
                          >
                            {issue.subject}
                          </Link>
                        </div>
                        {/* Move buttons */}
                        {signer && (
                          <div className="flex gap-1 mt-2">
                            {colIdx > 0 && (
                              <button
                                onClick={() => handleMoveIssue(selectedBoard, issueId, colIdx, colIdx - 1)}
                                className="btn btn-sm text-xs px-2 py-0.5"
                                title={`Move to ${selectedBoard.columns[colIdx - 1].name}`}
                              >
                                ← {selectedBoard.columns[colIdx - 1].name}
                              </button>
                            )}
                            {colIdx < selectedBoard.columns.length - 1 && (
                              <button
                                onClick={() => handleMoveIssue(selectedBoard, issueId, colIdx, colIdx + 1)}
                                className="btn btn-sm text-xs px-2 py-0.5"
                                title={`Move to ${selectedBoard.columns[colIdx + 1].name}`}
                              >
                                {selectedBoard.columns[colIdx + 1].name} →
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Unassigned issues */}
        {unassignedIssues.length > 0 && signer && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold mb-3">Unassigned Issues</h2>
            <div className="Box">
              {unassignedIssues.map((issue) => {
                const status = getLatestStatus(issue.id);
                return (
                  <div key={issue.id} className="Box-row flex items-center gap-3">
                    <StatusBadge kind={status} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-text-primary font-medium">{issue.subject}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {selectedBoard.columns.map((col, colIdx) => (
                        <button
                          key={col.name}
                          onClick={() => handleAddIssueToColumn(selectedBoard, issue.id, colIdx)}
                          className="btn btn-sm text-xs px-2 py-0.5"
                        >
                          + {col.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Boards list view
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-3">
        <Link to={`/repo/${repoPubkey}/${identifier}`} className="text-sm text-accent hover:underline">
          &larr; Back to {identifier}
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Project Boards</h1>
        {signer && (
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="btn btn-primary btn-sm"
          >
            New Board
          </button>
        )}
      </div>

      {/* Create board form */}
      {showNewForm && signer && (
        <div className="Box mb-6">
          <div className="Box-header py-2 px-4">
            <h2 className="text-sm font-semibold">Create a new board</h2>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Board Name</label>
              <input
                type="text"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                placeholder="Sprint 1"
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Column Names (comma-separated)</label>
              <input
                type="text"
                value={newColumnNames}
                onChange={(e) => setNewColumnNames(e.target.value)}
                placeholder="To Do, In Progress, Done"
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateBoard}
                disabled={creating || !newBoardName.trim()}
                className="btn btn-primary"
              >
                {creating ? "Creating..." : "Create Board"}
              </button>
              <button onClick={() => setShowNewForm(false)} className="btn">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Board list */}
      {boards.length === 0 ? (
        <div className="Blankslate Box">
          <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted mx-auto mb-2">
            <path d="M1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25V1.75C0 .784.784 0 1.75 0ZM1.5 1.75v12.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25ZM11.75 3a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-1.5 0v-7.5a.75.75 0 0 1 .75-.75Zm-8.25.75a.75.75 0 0 1 1.5 0v5.5a.75.75 0 0 1-1.5 0ZM8 3a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 3Z"/>
          </svg>
          <p>No project boards yet</p>
          <p className="text-xs text-text-muted mt-1">Create a board to organize issues into columns</p>
        </div>
      ) : (
        <div className="Box">
          {boards.map((board) => {
            const author = profiles.get(board.pubkey);
            return (
              <Link
                key={board.id}
                to={`/repo/${repoPubkey}/${identifier}/boards/${board.identifier}`}
                className="Box-row flex items-start gap-3 no-underline hover:no-underline"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted mt-0.5 shrink-0">
                  <path d="M1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25V1.75C0 .784.784 0 1.75 0ZM1.5 1.75v12.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25ZM11.75 3a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-1.5 0v-7.5a.75.75 0 0 1 .75-.75Zm-8.25.75a.75.75 0 0 1 1.5 0v5.5a.75.75 0 0 1-1.5 0ZM8 3a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 3Z"/>
                </svg>
                <div className="min-w-0 flex-1">
                  <span className="text-text-primary font-medium hover:text-accent">{board.name}</span>
                  <div className="text-xs text-text-muted mt-0.5">
                    {board.columns.length} columns · {board.columns.reduce((sum, c) => sum + c.issueIds.length, 0)} issues · created by {author?.name ?? shortenKey(board.pubkey)} · {timeAgo(board.createdAt)}
                  </div>
                  <div className="flex gap-1.5 mt-1">
                    {board.columns.map((col) => (
                      <span key={col.name} className="Label bg-accent/10 text-accent border-accent/20 text-[10px]">
                        {col.name}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
