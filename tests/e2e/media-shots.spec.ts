import { expect, test, type Page } from "./harness.ts";
import { signInForFeature } from "./feature-session.ts";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import { THEME_STORAGE_KEY, type ResolvedTheme } from "@/lib/theme";
import {
  prepareOwnedPlans,
  removeOwnedPlans,
  closeFixtureDb,
  limparMidiaDosPlanos,
} from "./db-fixture.ts";

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

/** Dois planos temporários próprios: um ganha foto, o outro fica sem. */
const PLANO_COM_FOTO = crypto.randomUUID();
const PLANO_SEM_FOTO = crypto.randomUUID();

/**
 * Sessao reaproveitada, nao refeita (secao 8 do docs/PWA_AND_HARDENING.md).
 *
 * Quem precisa de contexto limpo e o spec de entrar e sair; aqui a sessao e
 * meio, nao fim. Medido no B11: com cada spec fazendo o proprio login, a matriz
 * completa acumulava logins novos no Neon Auth e um deles estourava os 30 s da
 * navegacao — falha diferente a cada execucao, com a aplicacao integra.
 */
async function signIn(page: Page): Promise<void> {
  await signInForFeature(page, account);
}

async function enviarFoto(page: Page): Promise<void> {
  const antes = await page.locator('img[src^="/api/media/"]').count();

  await page
    .locator('input[type="file"]')
    .setInputFiles(
      antes === 0
        ? "public/brand/photos/table.webp"
        : "public/brand/photos/coast.webp",
    );

  await expect(page.locator('img[src^="/api/media/"]')).toHaveCount(antes + 1, {
    timeout: 60_000,
  });
}

test.beforeAll(async () => {
  await prepareOwnedPlans([PLANO_COM_FOTO, PLANO_SEM_FOTO]);
});

test.afterAll(async () => {
  // Linhas e objetos: a branch não guarda mídia de teste depois da captura.
  await removeOwnedPlans([PLANO_COM_FOTO, PLANO_SEM_FOTO]);
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
