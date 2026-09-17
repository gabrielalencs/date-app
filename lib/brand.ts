/**
 * Cores de chrome do sistema operacional.
 *
 * `meta[name=theme-color]` e o manifest não leem variável CSS, então estes dois
 * HEX são a exceção sancionada à regra do design system (seção 3 do
 * docs/PWA_AND_HARDENING.md). Eles têm que continuar iguais a `--bg` de cada
 * tema em `app/globals.css`:
 *
 *   :root  { --bg: #fbf7f2 }  → THEME_COLOR_LIGHT
 *   .dark  { --bg: #0e171d }  → THEME_COLOR_DARK
 *
 * Um teste compara os dois pares contra o CSS, para que a próxima mudança de
 * paleta não deixe a barra de status para trás em silêncio.
 */
export const THEME_COLOR_LIGHT = "#fbf7f2";
export const THEME_COLOR_DARK = "#0e171d";

/**
 * O favicon de cada tema.
 *
 * **O que troca e o que não troca.** O favicon da aba troca: o navegador relê o
 * `<link rel="icon">` sempre que ele muda, então dá para acompanhar o tema. O
 * ícone do app instalado **não** troca — o sistema operacional o congela na
 * instalação e não volta a ler o manifest. São duas coisas diferentes com o
 * mesmo desenho, e só uma delas é reativa.
 *
 * O nome dos arquivos vem da arte: `icone_white` é o bloco creme, `icone_dark`
 * é o bloco navy. Cada um já traz o próprio fundo, então a escolha aqui é de
 * combinar com o tema da interface, não de garantir contraste.
 */
export const FAVICON_LIGHT = "/brand/icons/favicon-light.png";
export const FAVICON_DARK = "/brand/icons/favicon-dark.png";
