import type { Metadata } from "next";

import { fraunces, inter } from "@/app/fonts";
import { AppShell } from "@/components/shell/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeScript } from "@/components/theme-script";

import "./globals.css";

export const metadata: Metadata = {
  title: "date",
  description: "Organizador de experiências para duas pessoas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${fraunces.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
