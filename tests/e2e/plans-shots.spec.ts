import { test, type Page } from "./harness.ts";
import { signInForFeature } from "./feature-session.ts";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import { THEME_STORAGE_KEY, type ResolvedTheme } from "@/lib/theme";

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

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`telas de plano ${viewport.name} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: 900 });
      await page.addInitScript(
        ({ key, value }: { key: string; value: string }) => {
          window.localStorage.setItem(key, value);
        },
        { key: THEME_STORAGE_KEY, value: theme },
      );

      await signIn(page);

      // Um plano conhecido do seed, para a captura ser estável.
      const planoDoSeed = "22222222-0000-4000-8000-000000000003";

      for (const [nome, url] of [
        ["home", "/"],
        ["ideias", "/ideias"],
        ["novo", "/novo"],
        ["detalhe", `/planos/${planoDoSeed}`],
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
          path: `screenshots/${nome}-${viewport.name}-${theme}.png`,
          fullPage: true,
        });
      }
    });
  }
}
