import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth } from "./useAuth";
import { useRelays } from "./useRelays";
import { fetchNotifications } from "../lib/nostr";
import type { NotificationItem } from "../types/nostr";

interface NotificationState {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  markAllRead: () => void;
  refresh: () => void;
}

const LAST_SEEN_KEY = "nostrlab-notif-last-seen";
const NotificationContext = createContext<NotificationState | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { pubkey } = useAuth();
  const { globalRelays } = useRelays();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [lastSeen, setLastSeen] = useState<number>(() => {
    return parseInt(localStorage.getItem(LAST_SEEN_KEY) ?? "0", 10);
  });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!pubkey) { setNotifications([]); return; }
    setLoading(true);
    try {
      const since = Math.floor(Date.now() / 1000) - 7 * 86400; // last 7 days
      const items = await fetchNotifications(pubkey, since, globalRelays);
      setNotifications(items);
    } catch {
      // Notification fetch failed silently — will retry on next load
    } finally {
      setLoading(false);
    }
  }, [pubkey, globalRelays]);

  useEffect(() => { load(); }, [load]);

  const unreadCount = notifications.filter((n) => n.createdAt > lastSeen).length;

  const markAllRead = useCallback(() => {
    const now = Math.floor(Date.now() / 1000);
    setLastSeen(now);
    localStorage.setItem(LAST_SEEN_KEY, String(now));
  }, []);

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, loading, markAllRead, refresh: load }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationState {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
