import { Geist, Geist_Mono, Cormorant_Garamond, Anton } from "next/font/google";

export const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Cormorant Garamond — Old Style serif used for the auction-catalog
// presentation on the home page. High contrast, elegant, suggests
// "rare, curated, expensive."
export const fontSerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

// Anton — condensed display sans, the canonical movie-poster / racing /
// underground-stage typeface. Used only for the massive headlines on the
// underground-stage home page.
export const fontDisplay = Anton({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-display",
  display: "swap",
});
