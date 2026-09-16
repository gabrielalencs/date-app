import type { MetadataRoute } from "next";

import { THEME_COLOR_LIGHT } from "@/lib/brand";

/**
 * Manifest como rota do App Router (`/manifest.webmanifest`), não arquivo
 * estático: fica num lugar só, junto das constantes de marca, e o valor de
 * `theme_color` não pode divergir do `<meta name="theme-color">` do layout.
 *
 * Seção 3 do docs/PWA_AND_HARDENING.md.
 *
 * O que está ausente é tão decidido quanto o que está presente:
 *
 * - sem `orientation`: travar em retrato quebra quem usa o telefone em suporte
 *   fixo, e é falha de acessibilidade, não preferência estética (D-131);
 * - sem `shortcuts`: abaixo da linha de corte do B11;
 * - sem `screenshots`: não é o bloco.
 *
 * O navegador busca este arquivo **sem credenciais**. Se o proxy o redirecionar
 * para /login, a instalação deixa de ser oferecida sem erro visível — por isso
 * `/manifest.webmanifest` é caminho público explícito no proxy.ts.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    /* Fixo desde o primeiro deploy: é a identidade da instalação. Sem ele, uma
       mudança futura de `start_url` viraria um segundo DATE na tela inicial. */
    id: "/",
    name: "DATE",
    short_name: "DATE",
    description:
      "Organizar ideias de rolês, escolher datas, planejar e guardar memórias — para duas pessoas.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "pt-BR",
    dir: "ltr",
    /* A splash do Android usa este valor sempre, independentemente do tema do
       sistema: não existe splash escura. O cream é a escolha consciente. */
    background_color: THEME_COLOR_LIGHT,
    theme_color: THEME_COLOR_LIGHT,
    icons: [
      {
        src: "/brand/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      /* Entrada separada, nunca "any maskable" no mesmo arquivo: declarar os
         dois propósitos num arquivo só afirma que o mesmo desenho serve para as
         duas situações, e essa afirmação precisa ser medida, não suposta. */
      {
        src: "/brand/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
