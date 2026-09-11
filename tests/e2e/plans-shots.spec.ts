import { test, type Page } from "@playwright/test";

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

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"]', account.email);
  await page.fill('input[name="password"]', account.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => new URL(url).pathname === "/", {
    timeout: 30_000,
  });
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
