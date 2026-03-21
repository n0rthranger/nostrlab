interface Props {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function NostrLabLogo({ size = 28, className = "", style }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 0 4px rgba(191, 90, 242, 0.4))", ...style }}
    >
      {/* Flask rim */}
      <rect x="23" y="4" width="18" height="4" rx="2" fill="#9088b0" />
      {/* Flask neck */}
      <path d="M26 8v14h12V8" fill="#1a1a2e" stroke="#9088b0" strokeWidth="2" />
      {/* Flask body — wide conical */}
      <path
        d="M26 22L12 50c-1 2 .5 5 3 5h34c2.5 0 4-3 3-5L38 22"
        fill="#1a1a2e"
        stroke="#9088b0"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Liquid fill — bottom portion */}
      <path
        d="M18 42L12 50c-1 2 .5 5 3 5h34c2.5 0 4-3 3-5l-6-8z"
        fill="#bf5af2"
        opacity="0.3"
      />
      {/* Zap bolt — classic Nostr lightning, centered in flask */}
      <path
        d="M35 18h-6l-4 16h6l-3 16 14-20h-8l5-12z"
        fill="#ffd60a"
      />
      <path
        d="M35 18h-6l-4 16h6l-3 16 14-20h-8l5-12z"
        fill="#ffd60a"
        opacity="0.3"
        filter="url(#nostrlab-glow)"
      />
      <defs>
        <filter id="nostrlab-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
        </filter>
      </defs>
    </svg>
  );
}
