"use client";

import {
  useCallback,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  FAVICON_DARK,
  FAVICON_LIGHT,
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
} from "@/lib/brand";
import {
  parseStoredPreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/* Store da preferência: localStorage não é reativo, então a escrita avisa os
   assinantes. useSyncExternalStore evita setState dentro de effect. */
let cachedPreference: ThemePreference | null = null;
const listeners = new Set<() => void>();

function subscribePreference(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getPreferenceSnapshot(): ThemePreference {
  cachedPreference ??= parseStoredPreference(
    window.localStorage.getItem(THEME_STORAGE_KEY),
  );
  return cachedPreference;
}

function getPreferenceServerSnapshot(): ThemePreference {
  return "system";
}

function writePreference(next: ThemePreference) {
  cachedPreference = next;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage bloqueado ainda troca o tema na sessão atual.
  }
  for (const listener of listeners) {
    listener();
  }
}

/* Store do sistema operacional, para `system` reagir em tempo real. */
function subscribeSystem(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSystemSnapshot(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

function getSystemServerSnapshot(): boolean {
  return false;
}

export function useTheme(): {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
} {
  const preference = useSyncExternalStore(
    subscribePreference,
    getPreferenceSnapshot,
    getPreferenceServerSnapshot,
  );

  const systemPrefersDark = useSyncExternalStore(
    subscribeSystem,
    getSystemSnapshot,
    getSystemServerSnapshot,
  );

  const setPreference = useCallback((next: ThemePreference) => {
    writePreference(next);
  }, []);

  return {
    preference,
    resolved: resolveTheme(preference, systemPrefersDark),
    setPreference,
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { resolved } = useTheme();

  // Efeito legítimo: sincroniza estado do React com o DOM externo.
  useEffect(() => {
    const dark = resolved === "dark";
    document.documentElement.classList.toggle("dark", dark);

    /* A barra de status do app instalado acompanha a troca de tema. O meta é
       criado pelo ThemeScript antes da primeira pintura; aqui só o conteúdo
       muda. Se ele não existir (JS do head bloqueado), os metas com `media` do
       viewport continuam valendo e não há nada a fazer. */
    const meta = document.getElementById("date-theme-color");
    if (meta instanceof HTMLMetaElement) {
      meta.content = dark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;
    }

    /* O favicon da aba acompanha a troca — diferente do ícone do app instalado,
       que o sistema congela na instalação e nunca mais relê.

       O link é criado pelo ThemeScript antes da primeira pintura; aqui só o
       `href` muda. Se ele não existir (JS do head bloqueado), vale o
       `/favicon.ico` de `public/`, que o navegador busca por convenção. */
    const favicon = document.getElementById("date-favicon");
    if (favicon instanceof HTMLLinkElement) {
      favicon.href = dark ? FAVICON_DARK : FAVICON_LIGHT;
    }
  }, [resolved]);

  return children;
}
