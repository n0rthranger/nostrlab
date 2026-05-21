import type { Metadata, Viewport } from "next";
import { fontSans, fontMono, fontSerif, fontDisplay } from "./fonts";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3030"),
  title: "NostrLab — local events worldwide",
  description:
    "Open-source meetup tools for Nostr communities. Publish events, collect RSVPs, and run check-in from one place.",
  manifest: "/manifest.json",
  applicationName: "NostrLab",
  icons: {
    icon: [
      { url: "/icons/nostrlab-mark.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  openGraph: {
    title: "NostrLab",
    description: "Open-source meetup tools for Nostr communities.",
    type: "website",
    url: "/",
    siteName: "NostrLab",
    images: [{ url: "/hero-cinematic-meetup.png", width: 1200, height: 630, alt: "NostrLab meetup discovery" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "NostrLab",
    description: "Open-source meetup tools for Nostr communities.",
    images: ["/hero-cinematic-meetup.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafb" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontMono.variable} ${fontSerif.variable} ${fontDisplay.variable}`}
    >
      <body className="min-h-screen flex flex-col pb-[calc(4.75rem+env(safe-area-inset-bottom))] antialiased selection:bg-accent/25 md:pb-0">
        <Providers>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
