/*
 * O botão de emergência. Não é registrado por ninguém.
 *
 * Service worker é a única coisa deste projeto que não se desfaz com deploy
 * comum: `git revert` não alcança o navegador de quem já instalou. Então a
 * saída existe antes de ser necessária (seção 2 do docs/PWA_AND_HARDENING.md).
 *
 * Como usar: copie o conteúdo deste arquivo por cima de public/sw.js e faça o
 * deploy. Todo navegador que buscar /sw.js recebe esta versão, que apaga os
 * caches, se desregistra e recarrega as abas abertas.
 *
 * Só funciona porque /sw.js responde com Cache-Control: no-cache.
 */

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((client) => client.navigate(client.url));
    })(),
  );
});
