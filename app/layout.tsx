import type { Metadata } from "next";

import { fraunces, inter } from "@/app/fonts";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeScript } from "@/components/theme-script";

import "./globals.css";

export const metadata: Metadata = {
  title: "date",
  description: "Organizador de experiências para duas pessoas.",
};

/**
 * Só tema e fontes. O shell de navegação vive no grupo (private), para /login
 * não herdar bottom nav e sidebar — esconder por CSS não seria proteção.
 */
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
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
