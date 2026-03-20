import { useEffect, useCallback, useState, createContext, useContext, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

interface Shortcut {
  key: string;
  description: string;
  handler: () => void;
}

interface KeyboardCtx {
  shortcuts: Shortcut[];
  registerShortcut: (shortcut: Shortcut) => void;
  unregisterShortcut: (key: string) => void;
  showHelp: boolean;
  setShowHelp: (show: boolean) => void;
}

const KeyboardContext = createContext<KeyboardCtx | null>(null);

export function KeyboardShortcutProvider({ children }: { children: ReactNode }) {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [showHelp, setShowHelp] = useState(false);

  const registerShortcut = useCallback((shortcut: Shortcut) => {
    setShortcuts((prev) => {
      const filtered = prev.filter((s) => s.key !== shortcut.key);
      return [...filtered, shortcut];
    });
  }, []);

  const unregisterShortcut = useCallback((key: string) => {
    setShortcuts((prev) => prev.filter((s) => s.key !== key));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) {
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }

      if (e.key === "Escape" && showHelp) {
        setShowHelp(false);
        return;
      }

      const match = shortcuts.find((s) => s.key === e.key);
      if (match) {
        e.preventDefault();
        match.handler();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts, showHelp]);

  return (
    <KeyboardContext.Provider value={{ shortcuts, registerShortcut, unregisterShortcut, showHelp, setShowHelp }}>
      {children}
      {showHelp && <ShortcutHelpOverlay shortcuts={shortcuts} onClose={() => setShowHelp(false)} />}
    </KeyboardContext.Provider>
  );
}

function ShortcutHelpOverlay({ shortcuts, onClose }: { shortcuts: Shortcut[]; onClose: () => void }) {
  const defaultShortcuts: Shortcut[] = [
    { key: "?", description: "Toggle this help", handler: () => {} },
    { key: "Escape", description: "Close dialogs", handler: () => {} },
  ];

  const allShortcuts = [...defaultShortcuts, ...shortcuts];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-bg-secondary border border-border rounded-xl p-6 max-w-md w-full mx-4 animate-fadeIn" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary bg-transparent border-0 cursor-pointer text-lg">x</button>
        </div>
        <div className="space-y-2">
          {allShortcuts.map((s) => (
            <div key={s.key} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-text-secondary">{s.description}</span>
              <kbd className="px-2 py-0.5 bg-bg-tertiary border border-border rounded text-xs font-mono text-text-primary">{s.key}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function useKeyboardShortcuts(): KeyboardCtx {
  const ctx = useContext(KeyboardContext);
  if (!ctx) throw new Error("useKeyboardShortcuts must be used within KeyboardShortcutProvider");
  return ctx;
}

export function useNavigationShortcuts() {
  const navigate = useNavigate();
  const { registerShortcut, unregisterShortcut } = useKeyboardShortcuts();

  useEffect(() => {
    const navShortcuts: Shortcut[] = [
      { key: "g", description: "Go to Explore", handler: () => navigate("/") },
      { key: "n", description: "New Repository", handler: () => navigate("/new") },
      { key: "s", description: "Go to Snippets", handler: () => navigate("/snippets") },
      { key: "i", description: "Go to Notifications", handler: () => navigate("/notifications") },
    ];

    for (const s of navShortcuts) registerShortcut(s);
    return () => { for (const s of navShortcuts) unregisterShortcut(s.key); };
  }, [navigate, registerShortcut, unregisterShortcut]);
}
