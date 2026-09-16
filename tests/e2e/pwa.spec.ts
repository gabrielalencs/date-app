import { parseDevCredentials } from "@/lib/auth/dev-provisioning";

import { expect, test, type Page } from "./harness.ts";
import { signInForFeature } from "./feature-session.ts";

const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (c) => c.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

/**
 * O que a PWA promete, medido no navegador (B11).
 *
 * Nada aqui depende de sessão: manifest, service worker, ícones e a página
 * offline são exatamente o que o navegador busca **sem credenciais**, e é essa
 * a propriedade sob teste.
 */

/**
 * `page.evaluate`, nao `page.waitForFunction`: waitForFunction checa a
 * veracidade do valor devolvido sem aguardar promessa, e uma funcao async
 * devolve uma Promise, que e sempre verdadeira. A espera terminava antes de o
 * worker instalar e o cache aparecia vazio — instrumento quebrado dando
 * resultado limpo.
 */
async function esperarWorkerAtivo(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active?.state ?? "(sem worker ativo)";
  });
}

async function conteudoDoCache(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const nomes = await caches.keys();
    const urls: string[] = [];
    for (const nome of nomes) {
      const cache = await caches.open(nome);
      for (const request of await cache.keys()) {
        urls.push(new URL(request.url).pathname);
      }
    }
    return urls.sort();
  });
}

test.describe("manifest e ícones", () => {
  test("o manifest responde sem cookie e declara o que instala o app", async ({
    page,
  }) => {
    /* Contexto limpo de propósito: é assim que o navegador busca o manifest.
       Se o proxy o redirecionasse para /login, o navegador receberia HTML onde
       espera JSON e a instalação sumiria sem erro nenhum. */
    const response = await page.request.get("/manifest.webmanifest", {
      headers: { cookie: "" },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain(
      "application/manifest+json",
    );

    const manifest = await response.json();
    expect(manifest.id).toBe("/");
    expect(manifest.name).toBe("DATE");
    expect(manifest.short_name).toBe("DATE");
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.lang).toBe("pt-BR");
    expect(manifest.background_color).toBe("#fbf7f2");

    /* Orientação ausente: travar em retrato quebra quem usa o telefone em
       suporte fixo. A ausência é a decisão, então ela é asserção. */
    expect(manifest.orientation).toBeUndefined();

    const purposes = manifest.icons.map(
      (icon: { purpose?: string }) => icon.purpose,
    );
    expect(purposes).toContain("maskable");
    /* Nunca "any maskable" no mesmo arquivo: seriam duas afirmações sobre um
       desenho só, e uma delas não teria sido medida. */
    for (const purpose of purposes) {
      expect(purpose).not.toContain(" ");
    }
  });

  test("todo ícone declarado existe e é PNG", async ({ page }) => {
    const manifest = await (
      await page.request.get("/manifest.webmanifest")
    ).json();

    for (const icon of manifest.icons as { src: string }[]) {
      const response = await page.request.get(icon.src);
      expect(response.status(), icon.src).toBe(200);
      expect(response.headers()["content-type"], icon.src).toBe("image/png");
    }

    for (const caminho of ["/apple-touch-icon.png", "/favicon.ico"]) {
      const response = await page.request.get(caminho);
      expect(response.status(), caminho).toBe(200);
    }
  });
});

test.describe("service worker", () => {
  test("registra e não cacheia nada além da página offline", async ({
    page,
  }) => {
    await page.goto("/login");
    await esperarWorkerAtivo(page);

    /* A asserção central do bloco. Se um dia alguém acrescentar uma estratégia
       de cache, o que aparece aqui é /api/media/... — as fotos do casal,
       legíveis sem cookie e depois do logout. */
    expect(await conteudoDoCache(page)).toEqual(["/offline.html"]);
  });

  test("o script do worker responde no-cache", async ({ page }) => {
    const response = await page.request.get("/sw.js");

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-cache");
    expect(response.headers()["content-type"]).toContain("text/javascript");

    /* O corpo não pode conter cache.put: é a regra do bloco escrita como
       teste, e não como comentário. */
    expect(await response.text()).not.toContain("cache.put");
  });

  test("a página offline existe e não carrega nada de fora", async ({
    page,
  }) => {
    const response = await page.request.get("/offline.html");
    expect(response.status()).toBe(200);

    const html = await response.text();
    expect(html).toContain('lang="pt-BR"');
    /* Servida do cache, sem rede: qualquer src/href externo apareceria em
       branco para quem está offline. */
    expect(html).not.toMatch(/<(script|img)\b/);
    expect(html).not.toContain("http://");
  });

  test("o sw-kill desregistra e limpa os caches", async ({ page }) => {
    /* Em /offline.html de proposito: e uma pagina estatica, sem JS de
       aplicacao. Numa rota do app, o kill recarrega a aba, o componente
       ServiceWorker monta de novo e registra /sw.js na hora — o teste mediria a
       corrida entre o kill e o app, e nao o kill. */
    await page.goto("/offline.html");

    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
    });
    expect(await conteudoDoCache(page)).toEqual(["/offline.html"]);

    /* O caminho de reversao, exercitado antes de ser necessario: em producao o
       conteudo de sw-kill.js substitui o de sw.js e um deploy resolve. */
    await page
      .evaluate(async () => {
        const registro = await navigator.serviceWorker.register("/sw-kill.js", {
          scope: "/",
        });
        await registro.update();
      })
      .catch(() => {
        // Esperado: o proprio kill recarrega a aba e derruba este contexto.
      });

    await expect
      .poll(
        async () => {
          try {
            return await page.evaluate(async () => {
              const registro =
                await navigator.serviceWorker.getRegistration("/");
              const chaves = await caches.keys();
              return `registro=${Boolean(registro)} caches=${chaves.length}`;
            });
          } catch {
            return "recarregando";
          }
        },
        { timeout: 20_000 },
      )
      .toBe("registro=false caches=0");
  });
});

test.describe("o HTML servido", () => {
  const rotas = [
    { path: "/login", title: "Entrar · DATE" },
    { path: "/offline.html", title: "Sem conexão · DATE" },
  ];

  for (const rota of rotas) {
    test(`${rota.path} declara idioma e título próprios`, async ({ page }) => {
      await page.goto(rota.path);
      await expect(page).toHaveTitle(rota.title);
      await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    });
  }

  test("cada rota privada tem título próprio no HTML servido", async ({
    page,
  }) => {
    await signInForFeature(page, account);

    const esperado: readonly (readonly [string, string])[] = [
      ["/", "Hoje · DATE"],
      ["/ideias", "Ideias · DATE"],
      ["/agenda", "Agenda · DATE"],
      ["/memorias", "Memórias · DATE"],
      ["/novo", "Novo DATE · DATE"],
      ["/perfil", "Perfil · DATE"],
    ];

    const vistos: string[] = [];
    for (const [rota, titulo] of esperado) {
      await page.goto(rota);
      /* Lido do HTML entregue, não do JSX: o `<title>` do documento é o que o
         sistema mostra na lista de janelas. */
      const servido = await page.title();
      vistos.push(servido);
      expect(servido, rota).toBe(titulo);
      await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    }

    // Rota que herdou o título do layout é rota que não existe na lista de janelas.
    expect(new Set(vistos).size).toBe(esperado.length);
  });

  test("o viewport pede área segura e não impede zoom", async ({ page }) => {
    await page.goto("/login");
    const content = await page
      .locator('meta[name="viewport"]')
      .getAttribute("content");

    expect(content).toContain("viewport-fit=cover");
    /* Impedir zoom é falha de acessibilidade. O zoom de teclado do iOS já está
       resolvido pelos 16px dos campos. */
    expect(content).not.toContain("maximum-scale");
    expect(content).not.toContain("user-scalable");
  });

  test("a barra de status segue o tema escolhido, não o do sistema", async ({
    browser,
  }) => {
    /* Sistema claro, DATE escuro: sem o meta sem `media` escrito pelo script do
       tema, a barra de status ficaria clara sobre interface escura. */
    const context = await browser.newContext({ colorScheme: "light" });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem("date-theme", "dark");
    });
    await page.goto("/login");

    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("#date-theme-color")).toHaveAttribute(
      "content",
      "#0e171d",
    );
    /* Primeiro theme-color do documento é o que o navegador usa. */
    const primeiro = page.locator('meta[name="theme-color"]').first();
    await expect(primeiro).toHaveAttribute("id", "date-theme-color");

    await context.close();
  });

  test("o link de pular conteúdo é o primeiro Tab e leva ao main", async ({
    page,
  }) => {
    /* Vive no AppShell, então só existe nas rotas privadas — /login não herda
       shell de propósito (esconder navegação por CSS não seria proteção). */
    await signInForFeature(page, account);
    await page.keyboard.press("Tab");

    const foco = page.locator(":focus");
    await expect(foco).toHaveText("Pular para o conteúdo");
    await expect(foco).toBeVisible();
    await expect(foco).toHaveAttribute("href", "#conteudo");
  });
});
