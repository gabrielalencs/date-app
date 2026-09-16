import { parseDevCredentials } from "@/lib/auth/dev-provisioning";

import { expect, test, type Page } from "./harness.ts";
import { signInForFeature } from "./feature-session.ts";

/**
 * A seção de notificações do Perfil, no navegador.
 *
 * **O que não está aqui, e por quê.** O handler de `push` do Service Worker não
 * é testado neste arquivo: o Chromium headless reporta
 * `Notification.permission === "denied"` de forma incondicional — medido com
 * `permissions: ["notifications"]` no contexto, com `grantPermissions` por
 * origem e com flag de linha de comando, os três devolvendo `denied`. Um push
 * entregue por CDP nesse estado não chega a virar notificação, e o teste
 * mediria a limitação do ambiente em vez do produto.
 *
 * O handler é exercido de verdade em `tests/service-worker-push.test.ts`, que
 * carrega o `public/sw.js` do disco e dispara os eventos contra um `self`
 * controlado. A aceitação no aparelho é da lista do proprietário.
 */

const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (c) => c.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

/**
 * Finge que o navegador ainda não decidiu sobre notificações.
 *
 * O headless nasce em `denied`, que é um estado real do produto mas não o
 * caminho principal. O stub existe para a tela do caminho principal poder ser
 * vista e medida — e ele registra toda chamada a `requestPermission`, que é o
 * que o teste seguinte precisa observar.
 */
async function comPermissaoPendente(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pedidos: string[] = [];
    Object.defineProperty(window, "__pedidosDePermissao", {
      value: pedidos,
      writable: false,
    });

    class NotificacaoFalsa {
      static permission = "default";
      static async requestPermission(): Promise<string> {
        pedidos.push("chamou");
        return "default";
      }
    }

    Object.defineProperty(window, "Notification", {
      value: NotificacaoFalsa,
      writable: true,
      configurable: true,
    });
  });
}

test.describe("a seção de notificações do Perfil", () => {
  test("explica o estado deste navegador em vez de sumir", async ({ page }) => {
    await signInForFeature(page, account);
    await page.goto("/perfil");

    const titulo = page.getByRole("heading", { name: "Notificações" });
    await expect(titulo).toBeVisible();

    /* Qualquer que seja o estado, a pessoa lê uma frase — nunca uma seção vazia
       nem um "Verificando…" que não termina. */
    const secao = page.locator("section").filter({ has: titulo });
    await expect(secao.locator("p").first()).not.toBeEmpty();
    await expect(secao.getByText("Verificando este aparelho")).toHaveCount(0);
  });

  test("nunca pede permissão sozinha", async ({ page }) => {
    /* A regra número um da seção 16: o prompt do sistema só nasce de um clique.
       Pedir ao carregar é como a pessoa perde a chance para sempre — um
       "bloquear" acidental não tem desfazer dentro do app. */
    await comPermissaoPendente(page);
    await signInForFeature(page, account);
    await page.goto("/perfil");

    await expect(
      page.getByRole("button", { name: "Ativar notificações" }),
    ).toBeVisible();

    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __pedidosDePermissao: string[] })
            .__pedidosDePermissao.length,
      ),
    ).toBe(0);
  });

  test("o convite tem alvo de toque de 44px em 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await comPermissaoPendente(page);
    await signInForFeature(page, account);
    await page.goto("/perfil");

    const botao = page.getByRole("button", { name: "Ativar notificações" });
    const caixa = await botao.boundingBox();
    expect(caixa!.height).toBeGreaterThanOrEqual(44);
  });

  test("clicar pede a permissão uma vez, e só no clique", async ({ page }) => {
    await comPermissaoPendente(page);
    await signInForFeature(page, account);
    await page.goto("/perfil");

    await page.getByRole("button", { name: "Ativar notificações" }).click();

    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            (window as unknown as { __pedidosDePermissao: string[] })
              .__pedidosDePermissao.length,
        ),
      )
      .toBe(1);
  });

  test("a rota de subscription recusa quem não tem sessão", async ({
    page,
  }) => {
    /* O Service Worker usa esta rota depois de um `pushsubscriptionchange`. Ela
       é a única superfície do bloco que aceita corpo vindo do navegador, e o
       corpo nunca diz de quem é a subscription.

       Sem cookie, a requisição nem chega ao handler: o proxy a manda para
       /login, que é a primeira das duas barreiras. `maxRedirects: 0` é
       obrigatório aqui — seguindo o redirecionamento, o teste receberia o HTML
       do login com status 200 e passaria a medir a página errada. O 401 do
       próprio handler é a segunda barreira, para o caso de a rota um dia sair
       da alçada do proxy. */
    const resposta = await page.request.post(
      "/api/notifications/subscription",
      {
        data: {
          endpoint: "https://push.invalid/forjado",
          keys: { p256dh: "x", auth: "y" },
        },
        maxRedirects: 0,
        failOnStatusCode: false,
      },
    );

    expect([301, 302, 307, 308, 401]).toContain(resposta.status());
    expect(resposta.status()).not.toBe(204);
  });

  test("o recovery recusa requisição sem segredo", async ({ page }) => {
    const semNada = await page.request.get("/api/notifications/recovery", {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    const comSegredoErrado = await page.request.get(
      "/api/notifications/recovery",
      {
        headers: { authorization: "Bearer segredo-errado" },
        maxRedirects: 0,
        failOnStatusCode: false,
      },
    );

    /* 401 com CRON_SECRET configurado, 404 sem ela — as duas recusam, e nenhuma
       das duas executa reparo. */
    expect([401, 404]).toContain(semNada.status());
    expect([401, 404]).toContain(comSegredoErrado.status());
  });
});
