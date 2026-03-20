import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { DEFAULT_RELAYS } from "../lib/nostr";

interface RelayState {
  globalRelays: string[];
  repoRelays: Record<string, string[]>;
  setGlobalRelays: (relays: string[]) => void;
  setRepoRelays: (repoAddr: string, relays: string[]) => void;
  clearRepoRelays: (repoAddr: string) => void;
  getRelaysForRepo: (repoAddr: string) => string[];
}

const STORAGE_KEY = "nostrlab-relays";

const RelayContext = createContext<RelayState | null>(null);

function loadFromStorage(): { global: string[]; repo: Record<string, string[]> } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        global: parsed.global ?? DEFAULT_RELAYS,
        repo: parsed.repo ?? {},
      };
    }
  } catch { /* ignore */ }
  return { global: DEFAULT_RELAYS, repo: {} };
}

function saveToStorage(global: string[], repo: Record<string, string[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ global, repo }));
}

export function RelayProvider({ children }: { children: ReactNode }) {
  const initial = loadFromStorage();
  const [globalRelays, setGlobalRelaysState] = useState<string[]>(initial.global);
  const [repoRelays, setRepoRelaysState] = useState<Record<string, string[]>>(initial.repo);

  const setGlobalRelays = useCallback((relays: string[]) => {
    const filtered = relays.filter(Boolean);
    setGlobalRelaysState(filtered);
    setRepoRelaysState((currentRepo) => {
      saveToStorage(filtered, currentRepo);
      return currentRepo;
    });
  }, []);

  const setRepoRelays = useCallback((repoAddr: string, relays: string[]) => {
    const filtered = relays.filter(Boolean);
    setRepoRelaysState((currentRepo) => {
      const updated = { ...currentRepo, [repoAddr]: filtered };
      setGlobalRelaysState((currentGlobal) => {
        saveToStorage(currentGlobal, updated);
        return currentGlobal;
      });
      return updated;
    });
  }, []);

  const clearRepoRelays = useCallback((repoAddr: string) => {
    setRepoRelaysState((currentRepo) => {
      const updated = { ...currentRepo };
      delete updated[repoAddr];
      setGlobalRelaysState((currentGlobal) => {
        saveToStorage(currentGlobal, updated);
        return currentGlobal;
      });
      return updated;
    });
  }, []);

  const getRelaysForRepo = useCallback((repoAddr: string): string[] => {
    return repoRelays[repoAddr] ?? globalRelays;
  }, [globalRelays, repoRelays]);

  return (
    <RelayContext.Provider
      value={{ globalRelays, repoRelays, setGlobalRelays, setRepoRelays, clearRepoRelays, getRelaysForRepo }}
    >
      {children}
    </RelayContext.Provider>
  );
}

export function useRelays(): RelayState {
  const ctx = useContext(RelayContext);
  if (!ctx) throw new Error("useRelays must be used within RelayProvider");
  return ctx;
}
