import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useRef } from "react";
import hljs from "highlight.js";

interface Props {
  content: string;
  className?: string;
}

export default function MarkdownContent({ content, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.querySelectorAll("pre code").forEach((el) => {
        hljs.highlightElement(el as HTMLElement);
      });
    }
  }, [content]);

  return (
    <div ref={ref} className={`markdown-body ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
