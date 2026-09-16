"use client";

import { useEffect } from "react";

/**
 * Registro do service worker. É tudo que este componente faz.
 *
 * Nada de estado, nada de interface, nada de `beforeinstallprompt`: o banner de
 * instalação próprio ficou fora do B11 porque não existe no iOS e resolveria
 * metade do problema acrescentando estado à tela (seção 11 do
 * docs/PWA_AND_HARDENING.md). A orientação de instalação é texto estático no
 * perfil.
 *
 * O worker em si está em public/sw.js e cacheia exatamente um arquivo.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    /* Falha de registro não é erro visível para quem está usando: o app
       funciona igual sem worker. Também não vira console.error, porque o arnês
       do Playwright reprova a suíte inteira em qualquer erro de console. */
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);

  return null;
}
