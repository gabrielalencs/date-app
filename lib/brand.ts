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
