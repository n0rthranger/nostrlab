import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        bg2: "rgb(var(--bg-2) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        surface2: "rgb(var(--surface-2) / <alpha-value>)",
        elev: "rgb(var(--surface-elev) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        fg2: "rgb(var(--fg-2) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        subtle: "rgb(var(--subtle) / <alpha-value>)",
        inverse: "rgb(var(--inverse) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        borderSoft: "rgb(var(--border-soft) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        accentStrong: "rgb(var(--accent-strong) / <alpha-value>)",
        accentSoft: "rgb(var(--accent-soft) / <alpha-value>)",
        accentFg: "rgb(var(--accent-fg) / <alpha-value>)",
        electric: "rgb(var(--electric) / <alpha-value>)",
        electricStrong: "rgb(var(--electric-strong) / <alpha-value>)",
        electricSoft: "rgb(var(--electric-soft) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        successSoft: "rgb(var(--success-soft) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        dangerSoft: "rgb(var(--danger-soft) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"],
        display: ["var(--font-display)", "Impact", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        none: "0px",
        sm: "6px",
        DEFAULT: "10px",
        md: "10px",
        lg: "14px",
        xl: "18px",
        "2xl": "24px",
        "3xl": "32px",
        full: "9999px",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      animation: {
        "fade-in": "fadeIn 240ms ease-out",
        "rise":    "rise 320ms cubic-bezier(0.2, 0.7, 0.2, 1)",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        rise:   { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};

export default config;
