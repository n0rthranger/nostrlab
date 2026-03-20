import type { StatusKind } from "../types/nostr";
import { STATUS_OPEN, STATUS_APPLIED, STATUS_CLOSED, STATUS_DRAFT } from "../types/nostr";

interface Props {
  kind: StatusKind;
  className?: string;
  size?: "sm" | "md";
}

export default function StatusBadge({ kind, className = "", size = "sm" }: Props) {
  const iconSize = size === "md" ? 16 : 14;

  switch (kind) {
    case STATUS_OPEN:
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green/15 text-green ${className}`}>
          <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>
          </svg>
          Open
        </span>
      );
    case STATUS_APPLIED:
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple/15 text-purple ${className}`}>
          <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/>
          </svg>
          Merged
        </span>
      );
    case STATUS_CLOSED:
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red/15 text-red ${className}`}>
          <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L8 7.94 5.78 5.72a.75.75 0 0 0-1.06 1.06L6.94 9l-2.22 2.22a.75.75 0 1 0 1.06 1.06L8 10.06l2.22 2.22a.75.75 0 1 0 1.06-1.06L9.06 9l2.22-2.22Z"/>
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>
          </svg>
          Closed
        </span>
      );
    case STATUS_DRAFT:
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-bg-tertiary text-text-secondary ${className}`}>
          <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="currentColor">
            <path d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-1.25 1.25a.75.75 0 0 0 1.06 1.06l1.25-1.25a3.5 3.5 0 1 0-4.95-4.95l-1.25 1.25Zm-4.69 9.64a2 2 0 0 1 0-2.83l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a3.5 3.5 0 1 0 4.95 4.95l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0Z"/>
          </svg>
          Draft
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-bg-tertiary text-text-secondary ${className}`}>
          Unknown
        </span>
      );
  }
}
