import {
  FAVICON_DARK,
  FAVICON_LIGHT,
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
} from "@/lib/brand";
import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Roda antes da primeira pintura, então não pode importar nada em runtime: a
 * resolução de lib/theme.ts, das cores de chrome e dos favicons é reescrita
 * aqui de propósito.
 *
 * Faz três coisas:
 *
 * 1. escreve `.dark` na raiz, evitando o flash de tema;
 * 2. resolve a cor da barra de status do app instalado;
 * 3. resolve o favicon da aba.
 *
 * O (2) e o (3) existem pela mesma razão: as formas declarativas de fazer os
 * dois — `<meta name="theme-color" media="...">` e
 * `<link rel="icon" media="...">` — seguem o **sistema**, e o tema do DATE é
 * light/dark/system escolhido pela pessoa. Sistema claro com DATE escuro daria
 * barra de status clara e favicon claro sobre uma interface escura. Resolver
 * aqui, antes da primeira pintura, faz os dois seguirem a escolha real.
 *
 * O favicon inserido aqui é o **único** `rel="icon"` da página, e isso depende
 * de um detalhe: o `favicon.ico` mora em `public/`, não em `app/`. Em `app/` o
 * Next o detecta e gera um `<link rel="icon">` próprio — e remover esse link no
 * script não resolve, porque o React o reinsere na hidratação. Com dois links,
 * quem escolhe é o navegador e o resultado deixa de ser previsível.
 *
 * Em `public/` o arquivo continua sendo servido em `/favicon.ico`, que é onde
 * navegador e rastreador procuram por convenção quando não há link — é a
 * versão para quem não executa script.
 */
const SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(p!=="light"&&p!=="dark"&&p!=="system"){p="system"}var dark=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",dark);var m=document.createElement("meta");m.name="theme-color";m.id="date-theme-color";m.content=dark?${JSON.stringify(THEME_COLOR_DARK)}:${JSON.stringify(THEME_COLOR_LIGHT)};document.head.prepend(m);var l=document.createElement("link");l.rel="icon";l.id="date-favicon";l.type="image/png";l.href=dark?${JSON.stringify(FAVICON_DARK)}:${JSON.stringify(FAVICON_LIGHT)};document.head.appendChild(l)}catch(e){}})()`;

export function ThemeScript({ nonce }: { nonce?: string }) {
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
