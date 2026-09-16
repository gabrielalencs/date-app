import { parseDevCredentials } from "@/lib/auth/dev-provisioning";

import { expect, test, type Page } from "./harness.ts";
import { signInForFeature } from "./feature-session.ts";

/**
 * Capturas do app em modo standalone emulado (B11).
 *
 * **Emulação não prova área segura.** `display-mode: standalone` é uma media
 * feature que o CDP sabe forçar; `env(safe-area-inset-*)` é do aparelho, e num
 * desktop ele vale zero. Estas imagens mostram o enquadramento sem barra de
 * navegador e nada além disso — a barra inferior encostando no indicador de
 * gestos só aparece no telefone, e por isso está na lista do proprietário.
 */

const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (c) => c.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

async function emularStandalone(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "display-mode", value: "standalone" }],
  });
}

for (const tema of ["light", "dark"] as const) {
  test.describe(`standalone · ${tema}`, () => {
    test.use({ colorScheme: tema, viewport: { width: 390, height: 844 } });

    for (const [nome, rota] of [
      ["home", "/"],
      ["ideias", "/ideias"],
      ["perfil", "/perfil"],
    ] as const) {
      test(`${nome} em 390px`, async ({ page }) => {
        await signInForFeature(page, account);
        await emularStandalone(page);
        await page.goto(rota);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        /* A barra inferior é o elemento que a instalação muda de lugar; a
           captura existe para ela ser olhada. */
        await expect(
          page.getByRole("navigation", { name: "Navegação principal" }),
        ).toBeVisible();

        await page.screenshot({
          path: `screenshots/pwa-standalone-${nome}-390-${tema}.png`,
          fullPage: false,
        });
      });
    }

    test(`offline em 390px`, async ({ page }) => {
      await emularStandalone(page);
      await page.goto("/offline.html");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.screenshot({
        path: `screenshots/pwa-standalone-offline-390-${tema}.png`,
      });
    });
  });
}

test.describe("troca de tema com a CSP ligada", () => {
  /* O caminho que o nonce quebra primeiro: o script inline do tema. Se ele
     perder o nonce, a classe .dark não é escrita antes da pintura e a troca
     passa a piscar — e o arnês pega a violação de script-src sozinho. */
  test.use({ viewport: { width: 390, height: 844 } });

  test("alterna claro e escuro sem violação e sem recarregar", async ({
    page,
  }) => {
    await signInForFeature(page, account);
    await page.goto("/perfil");

    const html = page.locator("html");
    const meta = page.locator("#date-theme-color");

    await page.getByRole("button", { name: "Escuro", exact: true }).click();
    await expect(html).toHaveClass(/dark/);
    await expect(meta).toHaveAttribute("content", "#0e171d");
    await page.screenshot({
      path: "screenshots/pwa-tema-escuro-390.png",
    });

    await page.getByRole("button", { name: "Claro", exact: true }).click();
    await expect(html).not.toHaveClass(/dark/);
    await expect(meta).toHaveAttribute("content", "#fbf7f2");

    /* Recarrega no tema escolhido: é aqui que o flash apareceria, porque o
       script inline roda antes da primeira pintura. */
    await page.getByRole("button", { name: "Escuro", exact: true }).click();
    await page.reload();
    await expect(html).toHaveClass(/dark/);
    await expect(meta).toHaveAttribute("content", "#0e171d");

    // Volta ao padrão para não deixar estado para o próximo spec.
    await page.getByRole("button", { name: "Sistema", exact: true }).click();
  });
});
