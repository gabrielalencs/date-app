import { parseDevCredentials } from "@/lib/auth/dev-provisioning";

import { expect, test, type Page } from "./harness.ts";
import { signInForFeature } from "./feature-session.ts";

/**
 * O Service Worker recebendo push de verdade (seção 13 do
 * docs/NOTIFICATIONS.md).
 *
 * O push é entregue pelo CDP — `ServiceWorker.deliverPushMessage` —, que é o
 * mesmo caminho que o navegador usa quando o push chega do serviço externo. Sem
 * isso, o handler de `push` seria a única parte do bloco que ninguém executa
 * antes do telefone de outra pessoa.
 *
 * A leitura é por `registration.getNotifications()`: o que o sistema
 * operacional desenha na bandeja não é observável daqui, mas o que o worker
 * criou é.
 */

const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (c) => c.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

type Entregue = { title: string; body: string; url: string; tag: string };

async function prepararWorker(page: Page): Promise<{
  entregar: (payload: unknown) => Promise<void>;
  lidas: () => Promise<Entregue[]>;
}> {
  const cdp = await page.context().newCDPSession(page);

  /* `workerVersionUpdated` é o único lugar que entrega o registrationId, e ele
     precisa estar escutando antes de o worker ativar. */
  const registrationId = new Promise<string>((resolve) => {
    cdp.on("ServiceWorker.workerVersionUpdated", (evento) => {
      for (const versao of evento.versions) {
        if (versao.registrationId) resolve(versao.registrationId);
      }
    });
  });

  await cdp.send("ServiceWorker.enable");
  await page.goto("/login");
  await page.evaluate(() => navigator.serviceWorker.ready);

  const id = await registrationId;
  const origin = new URL(page.url()).origin;

  return {
    entregar: async (payload) => {
      await cdp.send("ServiceWorker.deliverPushMessage", {
        origin,
        registrationId: id,
        data: typeof payload === "string" ? payload : JSON.stringify(payload),
      });
    },
    lidas: async () =>
      page.evaluate(async () => {
        const registro = await navigator.serviceWorker.ready;
        const notificacoes = await registro.getNotifications();
        return notificacoes.map((n) => ({
          title: n.title,
          body: n.body,
          tag: n.tag,
          url: (n.data as { url?: string } | null)?.url ?? "",
        }));
      }),
  };
}

test.describe("push no Service Worker", () => {
  test.use({ permissions: ["notifications"] });

  test("um payload válido vira notificação com ícone, badge e link interno", async ({
    page,
  }) => {
    const worker = await prepararWorker(page);

    await worker.entregar({
      title: "Agora tem data",
      body: "“Jantar no Centro” está planejado para sábado.",
      url: "/planos/22222222-0000-4000-8000-000000000001",
      kind: "date_confirmed",
    });

    await expect
      .poll(async () => (await worker.lidas()).length)
      .toBeGreaterThan(0);

    const [notificacao] = await worker.lidas();
    expect(notificacao!.title).toBe("Agora tem data");
    expect(notificacao!.body).toContain("Jantar no Centro");
    expect(notificacao!.url).toBe(
      "/planos/22222222-0000-4000-8000-000000000001",
    );
    /* A tag é o que faz a segunda notificação do mesmo assunto substituir a
       primeira na bandeja em vez de empilhar. */
    expect(notificacao!.tag).toContain("date_confirmed");
  });

  test("URL externa no payload é descartada, nunca seguida", async ({
    page,
  }) => {
    const worker = await prepararWorker(page);

    for (const url of [
      "https://evil.example/roubo",
      "//evil.example/roubo",
      "javascript:alert(1)",
    ]) {
      await worker.entregar({
        title: `Teste ${url}`,
        body: "corpo",
        url,
        kind: "plan_created",
      });
    }

    await expect.poll(async () => (await worker.lidas()).length).toBe(3);

    /* Todas caem para a raiz: o worker monta o destino a partir do que
       reconhece, e o que não reconhece não vira navegação. */
    for (const notificacao of await worker.lidas()) {
      expect(notificacao.url).toBe("/");
    }
  });

  test("payload malformado falha em silêncio, sem notificação e sem erro", async ({
    page,
  }) => {
    const worker = await prepararWorker(page);

    await worker.entregar("isto não é json");
    await worker.entregar({ body: "sem título", url: "/" });
    await worker.entregar({ title: "", body: "título vazio" });

    /* Nada é exibido, e o arnês do B11 reprovaria qualquer `pageerror` que o
       handler tivesse deixado escapar. */
    expect(await worker.lidas()).toHaveLength(0);
  });

  test("o texto do payload é truncado antes de virar notificação", async ({
    page,
  }) => {
    const worker = await prepararWorker(page);

    await worker.entregar({
      title: "T".repeat(500),
      body: "B".repeat(2000),
      url: "/",
      kind: "plan_created",
    });

    await expect
      .poll(async () => (await worker.lidas()).length)
      .toBeGreaterThan(0);

    const [notificacao] = await worker.lidas();
    expect(notificacao!.title.length).toBe(120);
    expect(notificacao!.body.length).toBe(300);
  });
});

test.describe("a seção do Perfil", () => {
  test("mostra um estado humano e não pede permissão sozinha", async ({
    page,
  }) => {
    await signInForFeature(page, account);
    await page.goto("/perfil");

    const secao = page.getByRole("heading", { name: "Notificações" });
    await expect(secao).toBeVisible();

    /* Sem permissão concedida, o que aparece é o convite — nunca o prompt do
       sistema, que só pode nascer de um clique. */
    await expect(
      page.getByRole("button", { name: "Ativar notificações" }),
    ).toBeVisible();
  });

  test("o alvo de toque do botão tem 44px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInForFeature(page, account);
    await page.goto("/perfil");

    const botao = page.getByRole("button", { name: "Ativar notificações" });
    const caixa = await botao.boundingBox();
    expect(caixa!.height).toBeGreaterThanOrEqual(44);
  });
});
