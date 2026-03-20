import { useEffect, useRef, useState } from "react";
import hljs from "highlight.js";
import { detectLanguage, isBinaryFile } from "../lib/git";

interface Props {
  content: string;
  filename: string;
}

export default function FileViewer({ content, filename }: Props) {
  const codeRef = useRef<HTMLElement>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);

  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.removeAttribute("data-highlighted");
      hljs.highlightElement(codeRef.current);
    }
  }, [content, filename]);

  if (isBinaryFile(filename)) {
    return (
      <div className="border border-border rounded-lg p-8 text-center text-text-muted bg-bg-secondary">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg>
        Binary file — cannot display
      </div>
    );
  }

  const lang = detectLanguage(filename);
  const lines = content.split("\n");

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-bg-secondary">
      <div className="bg-bg-tertiary px-4 py-2 text-sm text-text-secondary border-b border-border flex items-center justify-between">
        <span className="font-mono">{filename}</span>
        <span className="text-xs text-text-muted">{lines.length} lines</span>
      </div>
      <div className="overflow-x-auto flex">
        {/* Line numbers */}
        <div className="select-none text-right pr-3 pl-3 py-3 text-xs text-text-muted font-mono border-r border-border bg-bg-primary shrink-0">
          {lines.map((_, i) => (
            <div
              key={i}
              className={`leading-5 cursor-pointer hover:text-accent ${selectedLine === i + 1 ? "text-accent font-bold" : ""}`}
              onClick={() => setSelectedLine(selectedLine === i + 1 ? null : i + 1)}
            >
              {i + 1}
            </div>
          ))}
        </div>
        {/* Code */}
        <pre className="m-0 p-3 flex-1 overflow-x-auto">
          <code ref={codeRef} className={lang ? `language-${lang}` : ""}>
            {content}
          </code>
        </pre>
      </div>
    </div>
  );
}
