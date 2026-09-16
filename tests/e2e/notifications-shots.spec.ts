import { parseDevCredentials } from "@/lib/auth/dev-provisioning";

import { expect, test, type Page } from "./harness.ts";
import { signInForFeature } from "./feature-session.ts";

/**
 * Capturas da seção de notificações no Perfil (B11.5).
 *
 * Dois estados são fotografados porque são os dois que uma pessoa real
 * encontra: o convite, antes de decidir, e os interruptores, depois de ativar.
 * O segundo é montado por stub — o Chromium headless não concede permissão de
 * notificação, e sem o stub metade da tela nunca seria vista.
 */

const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (c) => c.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

const LARGURAS = [320, 390, 1280] as const;

/**
 * A barra inferior é `fixed` e fica por cima de qualquer captura de elemento
 * que chegue perto do rodapé — a primeira leva destas imagens saiu com metade
 * dos interruptores escondidos atrás dela. Escondê-la durante a foto mostra a
 * seção inteira; no produto ela continua exatamente onde estava, e o respiro
 * que evita a sobreposição é o `padding-bottom` do `main`, provado no B11.
 */
async function esconderBarraInferior(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      'nav[aria-label="Navegação principal"] { display: none !important; }',
  });
}

/** Permissão ainda não decidida: o estado do convite. */
async function stubPendente(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, "Notification", {
      value: class {
        static permission = "default";
        static async requestPermission() {
          return "default";
        }
      },
      writable: true,
      configurable: true,
    });
  });
}

/**
 * Permissão concedida e subscription existente: o estado dos interruptores.
 *
 * O `getSubscription` é trocado no `pushManager` do registro real, para o
 * componente seguir o caminho verdadeiro até o fim.
 */
async function stubInscrito(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, "Notification", {
      value: class {
        static permission = "granted";
        static async requestPermission() {
          return "granted";
        }
      },
      writable: true,
      configurable: true,
    });

    const original = navigator.serviceWorker.ready;
    Object.defineProperty(navigator.serviceWorker, "ready", {
      get: () =>
        original.then((registro) => {
          Object.defineProperty(registro, "pushManager", {
            value: {
              getSubscription: async () => ({
                endpoint: "https://push.invalid/captura",
                toJSON: () => ({}),
                unsubscribe: async () => true,
              }),
            },
            configurable: true,
          });
          return registro;
        }),
      configurable: true,
    });
  });
}

for (const tema of ["light", "dark"] as const) {
  for (const largura of LARGURAS) {
    test.describe(`notificações ${largura} ${tema}`, () => {
      test.use({
        colorScheme: tema,
        viewport: { width: largura, height: 900 },
      });

      test("convite", async ({ page }) => {
        await stubPendente(page);
        await signInForFeature(page, account);
        await page.goto("/perfil");

        const secao = page.locator("section").filter({
          has: page.getByRole("heading", { name: "Notificações" }),
        });
        await expect(
          page.getByRole("button", { name: "Ativar notificações" }),
        ).toBeVisible();

        await esconderBarraInferior(page);
        await secao.screenshot({
          path: `screenshots/notificacoes-convite-${largura}-${tema}.png`,
        });
      });

      test("interruptores", async ({ page }) => {
        await stubInscrito(page);
        await signInForFeature(page, account);
        await page.goto("/perfil");

        const secao = page.locator("section").filter({
          has: page.getByRole("heading", { name: "Notificações" }),
        });
        await expect(
          secao.getByText("Este aparelho está recebendo notificações."),
        ).toBeVisible();

        await esconderBarraInferior(page);
        await secao.screenshot({
          path: `screenshots/notificacoes-ativo-${largura}-${tema}.png`,
        });
      });
    });
  }
}
