import { createECDH, randomBytes, randomUUID } from "node:crypto";

import { like } from "drizzle-orm";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";

import { closeFixtureDb, fixtureDb, schema } from "./db-fixture.ts";
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
 *
 * Pelo mesmo motivo, o estado "ativo" só é alcançado com o navegador simulado
 * no nível do `pushManager` (D-181). O que é simulado é só a resposta do
 * navegador sobre a inscrição; Server Actions, banco e remetente são os de
 * verdade.
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

/* ------------------------------------------------------------------ *
 * D-181 — o aparelho inscrito
 * ------------------------------------------------------------------ */

/** A pública VAPID que o build leu do mesmo `.env.local`. */
const CHAVE_SERVIDOR =
  process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "";

/** `.invalid` nunca resolve (RFC 2606): nada aqui sai da máquina. */
const PREFIXO = "https://push.invalid/e2e-perfil-";

/** Uma chave pública P-256 qualquer, em base64 URL-safe, como o navegador as guarda. */
function chavePublica(): string {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return ecdh.getPublicKey().toString("base64url");
}

type Inscricao = {
  endpoint: string;
  /** A `applicationServerKey` com que esta inscrição teria sido feita. */
  chave: string;
};

type RegistroDoPush = { cancelados: string[]; chavesPedidas: string[] };

/**
 * Um navegador com permissão concedida e inscrito, simulado no nível do
 * `pushManager`. Registra o que a tela pede a ele — cancelar, inscrever com qual
 * chave — para o teste conferir.
 *
 * `p256dh` e `auth` são válidos de verdade: o remetente cifra o payload antes
 * de tocar a rede, e uma chave de mentira pararia o envio antes do ponto que o
 * teste quer alcançar.
 */
async function comNavegadorInscrito(
  page: Page,
  inscricao: Inscricao,
): Promise<void> {
  await page.addInitScript(
    (dados) => {
      const paraBytes = (b64: string): ArrayBuffer => {
        const normal = b64.replace(/-/g, "+").replace(/_/g, "/");
        const bruto = atob(
          normal.padEnd(normal.length + ((4 - (normal.length % 4)) % 4), "="),
        );
        const bytes = new Uint8Array(bruto.length);
        for (let i = 0; i < bruto.length; i += 1) {
          bytes[i] = bruto.charCodeAt(i);
        }
        return bytes.buffer;
      };

      const paraTexto = (buffer: ArrayBuffer): string => {
        let bruto = "";
        for (const byte of new Uint8Array(buffer)) {
          bruto += String.fromCharCode(byte);
        }
        return btoa(bruto)
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      };

      const registro: RegistroDoPush = { cancelados: [], chavesPedidas: [] };
      Object.defineProperty(window, "__push", { value: registro });

      type Falsa = {
        endpoint: string;
        options: {
          applicationServerKey: ArrayBuffer;
          userVisibleOnly: boolean;
        };
      };
      let atual: Falsa | null = null;

      const criar = (endpoint: string, chave: ArrayBuffer): Falsa => {
        const inscrita = {
          endpoint,
          expirationTime: null,
          options: { applicationServerKey: chave, userVisibleOnly: true },
          toJSON: () => ({
            endpoint,
            expirationTime: null,
            keys: { p256dh: dados.p256dh, auth: dados.auth },
          }),
          unsubscribe: async () => {
            registro.cancelados.push(endpoint);
            if (atual === inscrita) atual = null;
            return true;
          },
        };
        return inscrita;
      };

      atual = criar(dados.endpoint, paraBytes(dados.chave));

      const pushManager = {
        getSubscription: async () => atual,
        subscribe: async (opcoes: { applicationServerKey: ArrayBuffer }) => {
          registro.chavesPedidas.push(paraTexto(opcoes.applicationServerKey));
          atual = criar(`${dados.endpoint}-nova`, opcoes.applicationServerKey);
          return atual;
        },
      };

      class NotificacaoConcedida {
        static permission = "granted";
        static async requestPermission(): Promise<string> {
          return "granted";
        }
      }
      Object.defineProperty(window, "Notification", {
        value: NotificacaoConcedida,
        writable: true,
        configurable: true,
      });

      if (navigator.serviceWorker) {
        Object.defineProperty(navigator.serviceWorker, "ready", {
          configurable: true,
          get: () => Promise.resolve({ pushManager }),
        });
      }
    },
    {
      ...inscricao,
      p256dh: chavePublica(),
      auth: randomBytes(16).toString("base64url"),
    },
  );
}

function registroDoPush(page: Page): Promise<RegistroDoPush> {
  return page.evaluate(
    () => (window as unknown as { __push: RegistroDoPush }).__push,
  );
}

async function inscricoesNoServidor(endpoint: string) {
  return fixtureDb()
    .select({
      endpoint: schema.pushSubscriptions.endpoint,
      disabledAt: schema.pushSubscriptions.disabledAt,
    })
    .from(schema.pushSubscriptions)
    .where(like(schema.pushSubscriptions.endpoint, `${endpoint}%`));
}

test.describe("um aparelho inscrito", () => {
  test.skip(!CHAVE_SERVIDOR, "sem chave VAPID pública no .env.local");

  test.afterEach(async () => {
    await fixtureDb()
      .delete(schema.pushSubscriptions)
      .where(like(schema.pushSubscriptions.endpoint, `${PREFIXO}%`));
  });

  test.afterAll(async () => {
    await closeFixtureDb();
  });

  test("abrir o Perfil grava no servidor a inscrição que o navegador já tem", async ({
    page,
  }) => {
    /* O D-180 em navegador: o aparelho estava inscrito e o servidor não sabia. */
    const endpoint = `${PREFIXO}${randomUUID()}`;
    await comNavegadorInscrito(page, { endpoint, chave: CHAVE_SERVIDOR });
    await signInForFeature(page, account);
    await page.goto("/perfil");

    await expect(
      page.getByText("Este aparelho está recebendo notificações."),
    ).toBeVisible();
    await expect
      .poll(() => inscricoesNoServidor(endpoint))
      .toEqual([{ endpoint, disabledAt: null }]);

    /* Mesma chave: nada a trocar. */
    expect(await registroDoPush(page)).toEqual({
      cancelados: [],
      chavesPedidas: [],
    });
  });

  test("uma inscrição feita com outra chave é trocada pela da chave atual", async ({
    page,
  }) => {
    const endpoint = `${PREFIXO}${randomUUID()}`;
    await comNavegadorInscrito(page, { endpoint, chave: chavePublica() });
    await signInForFeature(page, account);
    await page.goto("/perfil");

    await expect
      .poll(async () => (await registroDoPush(page)).chavesPedidas)
      .toEqual([CHAVE_SERVIDOR]);
    expect((await registroDoPush(page)).cancelados).toEqual([endpoint]);

    /* O servidor fica só com a nova. A velha nunca chega a ser gravada: gravá-la
       seria guardar um endpoint que o push service recusaria em todo envio. */
    await expect
      .poll(() => inscricoesNoServidor(endpoint))
      .toEqual([{ endpoint: `${endpoint}-nova`, disabledAt: null }]);
    await expect(
      page.getByText("Este aparelho está recebendo notificações."),
    ).toBeVisible();
  });

  test("o envio de teste atravessa o servidor e diz onde parou", async ({
    page,
  }) => {
    const endpoint = `${PREFIXO}${randomUUID()}`;
    await comNavegadorInscrito(page, { endpoint, chave: CHAVE_SERVIDOR });
    await signInForFeature(page, account);
    await page.goto("/perfil");

    const botao = page.getByRole("button", {
      name: "Enviar notificação de teste",
    });
    const caixa = await botao.boundingBox();
    expect(caixa!.height).toBeGreaterThanOrEqual(44);

    await botao.click();

    /* Antes da rede, o servidor achou a subscription desta pessoa, leu as três
       variáveis VAPID, conferiu que a privada é da pública e cifrou o payload.
       `push.invalid` não resolve, então o envio para exatamente na rede — e a
       frase tem de dizer isso, não "chaves mal configuradas". */
    const secao = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Notificações" }) });
    await expect(secao.getByRole("alert")).toContainText(
      "O serviço de notificações não respondeu agora (network)",
    );
  });
});
