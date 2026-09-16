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
 *
 * O B11.5 acrescentou push, notificationclick e pushsubscriptionchange. A regra
 * de cache acima continua valendo integralmente: nada do que chega por push é
 * gravado, e o handler de push não toca no Cache Storage.
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

/* ------------------------------------------------------------------ *
 * B11.5 — notificações
 * ------------------------------------------------------------------ */

const ICONE = "/brand/icons/icon-192.png";
const BADGE = "/brand/icons/badge-96.png";

/**
 * Valida o payload antes de mostrar qualquer coisa.
 *
 * O payload é criptografado ponta a ponta e só o nosso servidor tem a chave,
 * mas validar aqui custa nada e fecha a classe inteira: nada vindo do payload
 * vira HTML, vira código ou vira URL externa. `url` precisa ser caminho
 * interno — uma barra, nunca duas, porque `//evil.com` é caminho relativo de
 * protocolo e o navegador o resolve como origem de fora.
 */
function lerPayload(event) {
  if (!event.data) return null;

  let bruto;
  try {
    bruto = event.data.json();
  } catch {
    return null;
  }

  if (!bruto || typeof bruto !== "object") return null;

  const title = typeof bruto.title === "string" ? bruto.title.slice(0, 120) : "";
  const body = typeof bruto.body === "string" ? bruto.body.slice(0, 300) : "";
  const kind = typeof bruto.kind === "string" ? bruto.kind.slice(0, 64) : "";
  const url = typeof bruto.url === "string" ? bruto.url : "/";

  if (!title) return null;

  const interno = /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@/%?#\[\]]*$/.test(url);

  return { title, body, kind, url: interno ? url : "/" };
}

self.addEventListener("push", (event) => {
  const payload = lerPayload(event);

  /* Falha segura: payload ilegível não vira notificação vazia nem exceção. O
     `userVisibleOnly` da subscription faz o navegador mostrar um aviso genérico
     se nada for exibido, e isso é melhor que exibir lixo. */
  if (!payload) return;

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: ICONE,
      badge: BADGE,
      lang: "pt-BR",
      /* Uma notificação por assunto: a segunda sobre o mesmo plano substitui a
         primeira na bandeja em vez de empilhar. */
      tag: payload.kind + ":" + payload.url,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const destino = event.notification.data && event.notification.data.url;
  const url = typeof destino === "string" && destino.startsWith("/") ? destino : "/";

  event.waitUntil(
    (async () => {
      const abas = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      /* Focar a aba que já existe, em vez de abrir a quinta janela do DATE. */
      for (const aba of abas) {
        if (new URL(aba.url).origin === self.location.origin) {
          await aba.focus();
          if ("navigate" in aba) await aba.navigate(url);
          return;
        }
      }

      await self.clients.openWindow(url);
    })(),
  );
});

/**
 * O navegador pode trocar a subscription sozinho. Sem este handler, a pessoa
 * simplesmente para de receber e nada na tela diz por quê.
 *
 * Reinscreve com a mesma applicationServerKey e entrega ao servidor pela rota
 * dedicada — o Service Worker não tem como chamar Server Action. A requisição
 * leva o cookie de sessão, e a rota resolve o contexto por conta própria.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const anterior = event.oldSubscription;
      const chave = anterior && anterior.options && anterior.options.applicationServerKey;
      if (!chave) return;

      try {
        const nova = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: chave,
        });

        await fetch("/api/notifications/subscription", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(nova.toJSON()),
        });
      } catch {
        /* Sem rede ou sem sessão: a próxima visita ao Perfil mostra o estado
           real e a pessoa reativa com um clique. */
      }
    })(),
  );
});
