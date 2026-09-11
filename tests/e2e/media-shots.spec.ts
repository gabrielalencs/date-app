import { expect, test, type Page } from "@playwright/test";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import { THEME_STORAGE_KEY, type ResolvedTheme } from "@/lib/theme";
import { closeFixtureDb, limparMidiaDosPlanos } from "./db-fixture.ts";
import { pngComExif } from "./exif-fixture.ts";

/**
 * Capturas de `/ideias` e `/planos/[id]` com foto e sem foto, nas três larguras
 * e nos dois temas. A grade com foto é a primeira vez que o produto tem a cara
 * que a prancha prometeu, e é isso que estas imagens existem para mostrar.
 *
 * O envio acontece uma vez, antes das capturas; depois tudo é removido, para a
 * branch não guardar mídia de teste.
 */
const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (c) => c.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

const VIEWPORTS = [
  { name: "320", width: 320 },
  { name: "390", width: 390 },
  { name: "1280", width: 1280 },
] as const;

const THEMES: readonly ResolvedTheme[] = ["light", "dark"];

/** Dois planos do seed: um ganha foto, o outro fica sem, na mesma grade. */
const PLANO_COM_FOTO = "22222222-0000-4000-8000-000000000005";
const PLANO_SEM_FOTO = "22222222-0000-4000-8000-000000000006";

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"]', account.email);
  await page.fill('input[name="password"]', account.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => new URL(url).pathname === "/", {
    timeout: 30_000,
  });
}

async function enviarFoto(page: Page): Promise<void> {
  const bytes = await pngComExif("public/brand/icons/icon-512.png");
  const antes = await page.locator('img[src^="/api/media/"]').count();

  await page.locator('input[type="file"]').setInputFiles({
    name: "foto.png",
    mimeType: "image/png",
    buffer: bytes,
  });

  await expect(page.locator('img[src^="/api/media/"]')).toHaveCount(antes + 1, {
    timeout: 60_000,
  });
}

test.afterAll(async () => {
  // Linhas e objetos: a branch não guarda mídia de teste depois da captura.
  await limparMidiaDosPlanos([PLANO_COM_FOTO]);
  await closeFixtureDb();
});

test("prepara: duas fotos no plano de captura", async ({ page }) => {
  await signIn(page);
  await limparMidiaDosPlanos([PLANO_COM_FOTO]);
  await page.goto(`/planos/${PLANO_COM_FOTO}`);

  // Uma vira capa, a outra fica na galeria — as duas telas ficam completas.
  await enviarFoto(page);
  await enviarFoto(page);

  await expect(page.locator('img[src^="/api/media/"]')).toHaveCount(2);
});

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`midia ${viewport.name} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: 900 });
      await page.addInitScript(
        ({ key, value }: { key: string; value: string }) => {
          window.localStorage.setItem(key, value);
        },
        { key: THEME_STORAGE_KEY, value: theme },
      );

      await signIn(page);

      for (const [nome, url] of [
        ["ideias", "/ideias"],
        ["detalhe-com-foto", `/planos/${PLANO_COM_FOTO}`],
        ["detalhe-sem-foto", `/planos/${PLANO_SEM_FOTO}`],
      ] as const) {
        await page.goto(url);
        await page.waitForLoadState("networkidle");

        await page.addStyleTag({
          content: `
            body > div { position: relative !important; }
            nav[aria-label="Navegação principal"] { position: static !important; }
            aside[data-shell="sidebar"] { position: absolute !important; }
          `,
        });

        await page.screenshot({
          path: `screenshots/midia-${nome}-${viewport.name}-${theme}.png`,
          fullPage: true,
        });
      }
    });
  }
}
