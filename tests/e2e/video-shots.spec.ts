import { readFileSync } from "node:fs";

import { inArray } from "drizzle-orm";

import { expect, test, type Page } from "./harness.ts";
import { signInForFeature } from "./feature-session.ts";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import { THEME_STORAGE_KEY, type ResolvedTheme } from "@/lib/theme";
import {
  closeFixtureDb,
  fixtureDb,
  limparMidiaDosPlanos,
  prepareOwnedPlans,
  removeOwnedPlans,
  schema,
} from "./db-fixture.ts";

/**
 * Capturas do vídeo (D-184): a Galeria com foto e vídeo lado a lado, a gaveta
 * de corte aberta sobre um vídeo longo, e o player. Três larguras, dois temas.
 *
 * Existem para serem abertas e olhadas — a DoD não aceita "renderizou" — e
 * ficam em `screenshots/`, fora do Git.
 */
const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (c) => c.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

const VIEWPORTS = [
  { name: "320", width: 320, height: 720 },
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 860 },
] as const;

const THEMES: readonly ResolvedTheme[] = ["light", "dark"];

const PLANO = crypto.randomUUID();
const FIXTURE = "tests/e2e/fixtures/video-65s.mp4";

async function signIn(page: Page): Promise<void> {
  await signInForFeature(page, account);
}

async function escolherVideo(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "VID_20261011_201512.mp4",
    mimeType: "video/mp4",
    buffer: readFileSync(FIXTURE),
  });

  const gaveta = page.getByRole("dialog", { name: "Escolha o trecho" });
  await expect(gaveta.getByText("Trecho de 1:00")).toBeVisible({
    timeout: 30_000,
  });
  // A prévia precisa ter um quadro na tela, ou a captura mostra um retângulo.
  await expect
    .poll(() =>
      gaveta.locator("video").evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThanOrEqual(2);

  await esperarAnimacoes(page);
  return gaveta;
}

/**
 * A gaveta entra em 320 ms. Quando a prévia carrega antes disso, a captura
 * pegava a gaveta translúcida, no meio do caminho — defeito da foto, não da
 * tela.
 */
async function esperarAnimacoes(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished)),
  );
}

test.beforeAll(async () => {
  await prepareOwnedPlans([PLANO]);
  await fixtureDb()
    .update(schema.plans)
    .set({ status: "completed" })
    .where(inArray(schema.plans.id, [PLANO]));
});

test.afterAll(async () => {
  await removeOwnedPlans([PLANO]);
  await closeFixtureDb();
});

test("prepara: uma foto e um vídeo na Galeria", async ({ page }) => {
  await signIn(page);
  await limparMidiaDosPlanos([PLANO]);
  await page.goto(`/planos/${PLANO}`);

  await page
    .locator('input[type="file"]')
    .setInputFiles("public/brand/photos/table.webp");
  await expect(page.locator('ul li img[src^="/api/media/"]')).toHaveCount(1, {
    timeout: 60_000,
  });

  const gaveta = await escolherVideo(page);
  await gaveta.getByRole("slider", { name: "Início do trecho" }).fill("120");
  await gaveta.getByRole("slider", { name: "Fim do trecho" }).fill("240");
  await gaveta.getByRole("button", { name: "Enviar trecho" }).click();
  await expect(gaveta).toHaveCount(0, { timeout: 120_000 });

  await expect(
    page.getByRole("button", { name: /^Assistir ao vídeo de/ }),
  ).toBeVisible({ timeout: 30_000 });
});

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`video ${viewport.name} ${theme}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.addInitScript(
        ({ key, value }: { key: string; value: string }) => {
          window.localStorage.setItem(key, value);
        },
        { key: THEME_STORAGE_KEY, value: theme },
      );

      await signIn(page);
      await page.goto(`/planos/${PLANO}`);
      await page.waitForLoadState("networkidle");

      const galeria = page.getByRole("heading", { name: "Galeria" });
      await galeria.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `screenshots/video-galeria-${viewport.name}-${theme}.png`,
      });

      const gaveta = await escolherVideo(page);
      await page.screenshot({
        path: `screenshots/video-corte-${viewport.name}-${theme}.png`,
      });

      // O trecho deslizado, para a captura mostrar a janela no meio da régua.
      await gaveta.getByRole("slider", { name: "Início do trecho" }).fill("40");
      await page.screenshot({
        path: `screenshots/video-corte-deslizado-${viewport.name}-${theme}.png`,
      });
      await gaveta.getByRole("button", { name: "Cancelar" }).click();
      await expect(gaveta).toHaveCount(0);

      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.getByRole("button", { name: /^Assistir ao vídeo de/ }).click();
      const player = page.getByRole("dialog", { name: /^Vídeo de / });
      await expect
        .poll(() =>
          player
            .locator("video")
            .evaluate((v: HTMLVideoElement) => v.readyState),
        )
        .toBeGreaterThanOrEqual(2);
      await esperarAnimacoes(page);
      await page.screenshot({
        path: `screenshots/video-player-${viewport.name}-${theme}.png`,
      });
    });
  }
}
