import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";

import { fraunces, inter } from "@/app/fonts";
import { ServiceWorker } from "@/components/service-worker";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeScript } from "@/components/theme-script";
import { THEME_COLOR_DARK, THEME_COLOR_LIGHT } from "@/lib/brand";

import "./globals.css";

export const metadata: Metadata = {
  /* Cada rota escreve o próprio título; o template guarda a marca no fim para
     a lista de janelas do sistema não virar cinco linhas iguais. */
  title: { default: "DATE", template: "%s · DATE" },
  description: "Organizador de experiências para duas pessoas.",
  applicationName: "DATE",
  appleWebApp: {
    capable: true,
    title: "DATE",
    /* `default` de propósito. `black-translucent` estende o conteúdo sob a
       barra de status e obrigaria env(safe-area-inset-top) em todo cabeçalho
       para ganhar alguns pixels. Não compensa. */
    statusBarStyle: "default",
  },
  /**
   * Só o apple-touch aqui.
   *
   * Os PNG de 192 e 512 são ícones de **aplicativo** e o lugar deles é o
   * manifest; declarados também como `icon` eles viravam candidatos a favicon e
   * competiam com o favicon por tema, que é montado pelo ThemeScript.
   *
   * O `<link rel="icon">` do `app/favicon.ico` continua saindo automaticamente
   * e é o que vale para quem não executa script; com script, o ThemeScript o
   * substitui pelo do tema certo antes da primeira pintura.
   */
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  /* O que faz env(safe-area-inset-*) devolver alguma coisa. Sem isto o CSS da
     barra inferior parece certo, passa em toda captura, e só falha no aparelho.

     Sem maximumScale e sem userScalable: impedir zoom é falha de
     acessibilidade, e o zoom de teclado do iOS já está resolvido pelos 16px
     dos campos no design system. */
  viewportFit: "cover",
  themeColor: [
    // Os dois valores são --bg de cada tema; ver lib/brand.ts.
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR_LIGHT },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR_DARK },
  ],
};

/**
 * Só tema, fontes e service worker. O shell de navegação vive no grupo
 * (private), para /login não herdar bottom nav e sidebar — esconder por CSS não
 * seria proteção.
 *
 * É async porque lê o nonce da CSP: com `strict-dynamic` todo script precisa
 * dele, inclusive o inline do tema. Ler headers() torna todas as rotas
 * dinâmicas, o que é o preço documentado do nonce por requisição.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="pt-BR"
      className={`${fraunces.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
