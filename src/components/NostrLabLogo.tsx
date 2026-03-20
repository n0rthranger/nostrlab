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
      {/* Body */}
      <ellipse cx="32" cy="40" rx="14" ry="10" fill="#9088b0" />
      {/* Tail feathers */}
      <path d="M18 38c-3-2-6-1-7 1s0 5 2 5c1 0 3-1 5-3" fill="#6e5d9e" />
      <path d="M17 35c-4-1-6 1-6 3s2 4 4 3c1-1 2-3 2-5" fill="#55507a" />
      {/* Neck */}
      <path d="M40 34c2-4 5-12 6-18" stroke="#9088b0" strokeWidth="3.5" strokeLinecap="round" />
      {/* Head */}
      <circle cx="47" cy="13" r="5" fill="#9088b0" />
      {/* Eye — neon cyan */}
      <circle cx="49" cy="12" r="1.8" fill="#0a0a14" />
      <circle cx="49.5" cy="11.5" r="0.6" fill="#00f0ff" />
      {/* Beak */}
      <path d="M52 13l6-1-6 3z" fill="#ff9f1c" />
      {/* Legs */}
      <path d="M28 49v10" stroke="#ff9f1c" strokeWidth="2" strokeLinecap="round" />
      <path d="M36 49v10" stroke="#ff9f1c" strokeWidth="2" strokeLinecap="round" />
      {/* Feet */}
      <path d="M24 59h8" stroke="#ff9f1c" strokeWidth="2" strokeLinecap="round" />
      <path d="M32 59h8" stroke="#ff9f1c" strokeWidth="2" strokeLinecap="round" />
      {/* Git branch symbol on body — neon purple */}
      <circle cx="29" cy="38" r="2" fill="none" stroke="#bf5af2" strokeWidth="1.2" />
      <circle cx="35" cy="38" r="2" fill="none" stroke="#bf5af2" strokeWidth="1.2" />
      <path d="M31 38h2" stroke="#bf5af2" strokeWidth="1.2" />
      {/* Merge node — neon cyan */}
      <circle cx="32" cy="43" r="2" fill="none" stroke="#00f0ff" strokeWidth="1.2" />
      <path d="M32 40v1" stroke="#00f0ff" strokeWidth="1.2" />
    </svg>
  );
}
