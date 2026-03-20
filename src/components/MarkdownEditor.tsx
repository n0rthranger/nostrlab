import { useState } from "react";
import MarkdownContent from "./MarkdownContent";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export default function MarkdownEditor({ value, onChange, placeholder = "Write something (Markdown supported)", minHeight = "h-32" }: Props) {
  const [preview, setPreview] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-0 bg-bg-tertiary border-b border-border">
        <button
          type="button"
          onClick={() => setPreview(false)}
          className={`px-4 py-2 text-xs font-medium cursor-pointer bg-transparent border-0 border-b-2 -mb-px ${
            !preview ? "border-accent text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          Write
        </button>
        <button
          type="button"
          onClick={() => setPreview(true)}
          className={`px-4 py-2 text-xs font-medium cursor-pointer bg-transparent border-0 border-b-2 -mb-px ${
            preview ? "border-accent text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          Preview
        </button>
      </div>
      {preview ? (
        <div className={`${minHeight} overflow-y-auto p-4 bg-bg-secondary`}>
          {value.trim() ? (
            <MarkdownContent content={value} />
          ) : (
            <p className="text-text-muted text-sm">Nothing to preview</p>
          )}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full ${minHeight} bg-bg-secondary px-4 py-3 text-sm text-text-primary resize-y placeholder:text-text-muted focus:outline-none border-0`}
        />
      )}
    </div>
  );
}
