/*
 * Service worker do DATE. Leia inteiro antes de mudar qualquer coisa.
 *
 * A regra, da seção 2 do docs/PWA_AND_HARDENING.md: este arquivo NUNCA grava
 * resposta autenticada no Cache Storage. As fotos do casal chegam por
 * /api/media/[id] com sessão; no Cache Storage elas ficariam legíveis sem
 * cookie, depois do logout e depois do login de outra pessoa. Cache Storage não
 * conhece sessão e não é despejado — é programado.
 *
 * O que ele cacheia, em toda a V1, é um arquivo: /offline.html. Todo o resto
 * passa direto. Sem estratégia, sem runtimeCaching, sem exceção para "só os
 * ícones" ou "só as fontes" — o Next já versiona os assets com hash e o cache
 * HTTP do navegador faz esse trabalho sem uma linha aqui.
 *
 * Reversão: o conteúdo de public/sw-kill.js substitui o deste arquivo e um
 * deploy resolve. Só funciona porque /sw.js responde Cache-Control: no-cache.
 */

const CACHE = "date-offline-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  /* Navegação: passa direto e, se a rede falhar, mostra a página offline. O
     `catch` é a única leitura de cache que existe aqui, e ela lê um arquivo
     estático que nunca teve dado de ninguém dentro. */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE).then((r) => r ?? Response.error()),
      ),
    );
    return;
  }

  /* Todo o resto: sem respondWith. Não interceptar é mais barato e mais seguro
     do que interceptar para repassar — o navegador segue o caminho normal. */
});
