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
    name: "Date",
    short_name: "Date",
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
    /**
     * O ícone do app instalado é **um só**, e isso não é escolha nossa: o
     * sistema operacional congela o ícone no momento da instalação e não o
     * relê depois. Não existe ícone de tela inicial que siga o tema — nem pelo
     * manifest, nem por outro caminho. Quem troca com o tema é o favicon da
     * aba, que o navegador relê a cada momento (ver components/theme-script).
     *
     * Os arquivos são gerados a partir de `icone_white.png`, que é a arte de
     * bloco creme. A fonte tem 1168x1169 — nem quadrada, nem nos tamanhos que
     * um manifest declara —, então declará-la direto faria o navegador receber
     * uma imagem que não corresponde ao `sizes` anunciado.
     */
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
      /* Entrada separada, nunca "any maskable" no mesmo arquivo. E esta sangra
         até a borda: o canto arredondado da arte é transparente, e quem
         arredonda um maskable é o sistema. Deixar a transparência faria o
         Android recortar sobre nada e o iOS compor preto atrás.

         Medido: o símbolo fica a 436px do centro e o raio seguro é 467px —
         passa, então o recorte em círculo não corta o calendário. */
      {
        src: "/brand/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
