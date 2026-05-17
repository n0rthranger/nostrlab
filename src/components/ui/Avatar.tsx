import { cn } from "@/lib/utils";
import { avatarGradient } from "@/lib/gradient";

export function Avatar({
  src, alt = "", size = 32, fallback, seed, className,
}: {
  src?: string | null;
  alt?: string;
  size?: number;
  fallback?: string;
  seed?: string;
  className?: string;
}) {
  const px = `${size}px`;
  if (!src) {
    const initials = (fallback ?? alt ?? "?").trim().slice(0, 2).toUpperCase();
    return (
      <div
        style={{ width: px, height: px, background: avatarGradient(seed ?? alt ?? fallback ?? "x") }}
        className={cn(
          "inline-flex items-center justify-center rounded-full text-white text-[11px] font-semibold ring-1 ring-black/5",
          className
        )}
      >
        {initials}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      style={{ width: px, height: px }}
      className={cn("rounded-full object-cover bg-surface2 ring-1 ring-black/5", className)}
    />
  );
}

// Stack of avatars with a "+N" pill for overflow
export function AvatarStack({
  users, max = 5, size = 28,
}: {
  users: { picture?: string | null; pubkey: string; displayName?: string | null; npub: string }[];
  max?: number;
  size?: number;
}) {
  if (users.length === 0) return null;
  const shown = users.slice(0, max);
  const overflow = users.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((u) => (
        <Avatar
          key={u.pubkey}
          src={u.picture}
          alt={u.displayName ?? u.npub}
          seed={u.pubkey}
          size={size}
          className="ring-2 ring-bg"
        />
      ))}
      {overflow > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-surface2 text-fg2 ring-2 ring-bg text-[11px] font-medium"
          style={{ width: size, height: size }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
