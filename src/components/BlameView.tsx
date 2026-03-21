import { useState, useEffect } from "react";
import { gitBlame, detectLanguage, type BlameLine } from "../lib/git";
import { timeAgo } from "../lib/nostr";
import hljs from "highlight.js";
import DOMPurify from "dompurify";

interface Props {
  repoDir: string;
  filepath: string;
}

export default function BlameView({ repoDir, filepath }: Props) {
  const [lines, setLines] = useState<BlameLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    gitBlame(repoDir, filepath).then((bl) => {
      if (cancelled) return;
      setLines(bl);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [repoDir, filepath]);

  if (loading) {
    return <div className="text-center py-8 text-text-muted text-sm">Loading blame...</div>;
  }

  const lang = detectLanguage(filepath);
  let highlighted: string[] = [];
  if (lang) {
    try {
      const code = lines.map((l) => l.content).join("\n");
      const result = hljs.highlight(code, { language: lang });
      highlighted = result.value.split("\n");
    } catch {
      highlighted = [];
    }
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-bg-secondary">
      <div className="bg-bg-tertiary px-4 py-2 text-sm text-text-secondary border-b border-border flex items-center justify-between">
        <span className="font-mono">{filepath}</span>
        <span className="text-xs text-text-muted">blame</span>
      </div>
      <div className="overflow-x-auto text-xs font-mono">
        {lines.map((line, i) => (
          <div key={i} className="flex hover:bg-bg-tertiary/50 border-b border-border/30">
            <div className="w-32 shrink-0 px-2 py-0.5 text-text-muted truncate border-r border-border/50 bg-bg-primary">
              <div className="truncate">{line.author}</div>
              <div className="text-[10px]">{line.commitOid.slice(0, 7)}</div>
            </div>
            <div className="w-20 shrink-0 px-2 py-0.5 text-text-muted text-right border-r border-border/50 bg-bg-primary text-[10px]">
              {timeAgo(line.timestamp)}
            </div>
            <div className="w-10 shrink-0 px-2 py-0.5 text-text-muted text-right border-r border-border/50 bg-bg-primary">
              {line.lineNumber}
            </div>
            <div className="flex-1 px-2 py-0.5">
              {highlighted[i] ? (
                <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlighted[i]) }} />
              ) : (
                <span>{line.content}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
