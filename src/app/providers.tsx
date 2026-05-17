"use client";

import { ThemeProvider } from "next-themes";
import { type ReactNode } from "react";
import { NostrProvider } from "@/hooks/useNostr";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <NostrProvider>{children}</NostrProvider>
    </ThemeProvider>
  );
}
