import { THEME_COLOR_DARK, THEME_COLOR_LIGHT } from "@/lib/brand";
import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Roda antes da primeira pintura, então não pode importar nada em runtime: a
 * resolução de lib/theme.ts e das cores de chrome é reescrita aqui de propósito.
 *
 * Faz duas coisas:
 *
 * 1. escreve `.dark` na raiz, evitando o flash de tema;
 * 2. resolve a cor da barra de status do app instalado.
 *
 * O (2) existe porque o `<meta name="theme-color" media="...">` do `viewport`
 * segue o **sistema**, e o tema do DATE é light/dark/system escolhido pela
 * pessoa. Sistema claro com DATE escuro daria barra de status clara sobre
 * interface escura. A correção é um meta sem `media` inserido no começo do
 * head: quando há vários `theme-color`, o navegador usa o primeiro cujo `media`
 * casa, e um meta sem `media` casa sempre. Os dois com `media` continuam no
 * HTML como base para quem está sem JavaScript.
 */
const SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(p!=="light"&&p!=="dark"&&p!=="system"){p="system"}var dark=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",dark);var m=document.createElement("meta");m.name="theme-color";m.id="date-theme-color";m.content=dark?${JSON.stringify(THEME_COLOR_DARK)}:${JSON.stringify(THEME_COLOR_LIGHT)};document.head.prepend(m)}catch(e){}})()`;

export function ThemeScript({ nonce }: { nonce?: string }) {
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
