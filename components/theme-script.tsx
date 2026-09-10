import { THEME_STORAGE_KEY } from "@/lib/theme";

// Roda antes da primeira pintura, então não pode importar nada em runtime:
// a resolução de lib/theme.ts é reescrita aqui de propósito.
const SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(p!=="light"&&p!=="dark"&&p!=="system"){p="system"}var dark=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",dark)}catch(e){}})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
