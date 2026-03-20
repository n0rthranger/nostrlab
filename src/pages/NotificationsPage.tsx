import { useEffect } from "react";
import { useNotifications } from "../hooks/useNotifications";
import { fetchProfiles, shortenKey, timeAgo } from "../lib/nostr";
import { useState } from "react";
import type { UserProfile } from "../types/nostr";
import { COMMENT, ISSUE, PATCH, PULL_REQUEST, STATUS_OPEN, STATUS_APPLIED, STATUS_CLOSED } from "../types/nostr";
import { useRelays } from "../hooks/useRelays";

function kindIcon(kind: number) {
  switch (kind) {
    case COMMENT:
      return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted"><path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>;
    case ISSUE:
      return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-green"><path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/></svg>;
    case PATCH:
      return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-accent"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/></svg>;
    case PULL_REQUEST:
      return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-green"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/></svg>;
    case STATUS_APPLIED:
      return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-purple"><path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/></svg>;
    case STATUS_CLOSED:
      return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-red"><path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L8 7.94 5.78 5.72a.75.75 0 0 0-1.06 1.06L6.94 9l-2.22 2.22a.75.75 0 1 0 1.06 1.06L8 10.06l2.22 2.22a.75.75 0 1 0 1.06-1.06L9.06 9l2.22-2.22Z"/><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/></svg>;
    default:
      return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted"><path d="M8 16a2 2 0 0 0 1.985-1.75c.017-.137-.097-.25-.235-.25h-3.5c-.138 0-.252.113-.235.25A2 2 0 0 0 8 16ZM3 5a5 5 0 0 1 10 0v2.947c0 .05.015.098.042.139l1.703 2.555A1.519 1.519 0 0 1 13.482 13H2.518a1.516 1.516 0 0 1-1.263-2.36l1.703-2.554A.255.255 0 0 0 3 7.947Zm5-3.5A3.5 3.5 0 0 0 4.5 5v2.947c0 .346-.102.683-.294.97l-1.703 2.556a.017.017 0 0 0-.003.01l.001.006c0 .002.002.004.004.006l.006.004.007.001h10.964l.007-.001.006-.004.004-.006.001-.007a.017.017 0 0 0-.003-.01l-1.703-2.554a1.745 1.745 0 0 1-.294-.97V5A3.5 3.5 0 0 0 8 1.5Z"/></svg>;
  }
}

function kindLabel(kind: number): string {
  switch (kind) {
    case COMMENT: return "commented";
    case ISSUE: return "opened an issue";
    case PATCH: return "submitted a patch";
    case PULL_REQUEST: return "opened a PR";
    case STATUS_OPEN: return "reopened";
    case STATUS_APPLIED: return "merged";
    case STATUS_CLOSED: return "closed";
    default: return "interacted";
  }
}

export default function NotificationsPage() {
  const { notifications, loading, markAllRead, refresh } = useNotifications();
  const { globalRelays } = useRelays();
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());

  useEffect(() => {
    const pubkeys = [...new Set(notifications.map((n) => n.fromPubkey))];
    if (pubkeys.length === 0) return;
    let cancelled = false;
    fetchProfiles(pubkeys, globalRelays).then((p) => {
      if (!cancelled) setProfiles(p);
    });
    return () => { cancelled = true; };
  }, [notifications, globalRelays]);

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Notifications</h1>
        <button onClick={refresh} className="btn btn-sm">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z" />
          </svg>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-text-secondary">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
          <p>Loading notifications...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="Blankslate Box">
          <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted mx-auto mb-2">
            <path d="M8 16a2 2 0 0 0 1.985-1.75c.017-.137-.097-.25-.235-.25h-3.5c-.138 0-.252.113-.235.25A2 2 0 0 0 8 16ZM3 5a5 5 0 0 1 10 0v2.947c0 .05.015.098.042.139l1.703 2.555A1.519 1.519 0 0 1 13.482 13H2.518a1.516 1.516 0 0 1-1.263-2.36l1.703-2.554A.255.255 0 0 0 3 7.947Z" />
          </svg>
          <h3 className="text-lg font-medium text-text-primary mb-1">All caught up!</h3>
          <p>You'll see activity here when people interact with your repos</p>
        </div>
      ) : (
        <div className="Box">
          {notifications.map((n) => {
            const profile = profiles.get(n.fromPubkey);
            const name = profile?.name ?? shortenKey(n.fromPubkey);
            return (
              <div key={n.id} className="Box-row flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {kindIcon(n.kind)}
                </div>
                {profile?.picture ? (
                  <img src={profile.picture} alt="" className="w-8 h-8 rounded-full shrink-0 avatar" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-bg-tertiary shrink-0 flex items-center justify-center text-text-muted text-xs">?</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium text-text-primary">{name}</span>{" "}
                    <span className="text-text-secondary">{kindLabel(n.kind)}</span>
                  </p>
                  {n.content && (
                    <p className="text-xs text-text-muted mt-0.5 truncate">{n.content}</p>
                  )}
                  <p className="text-xs text-text-muted mt-1">{timeAgo(n.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
