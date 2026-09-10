import { test } from "@playwright/test";

import { THEME_STORAGE_KEY, type ResolvedTheme } from "@/lib/theme";

const VIEWPORTS = [
  { name: "320", width: 320, height: 900 },
  { name: "390", width: 390, height: 900 },
  { name: "1280", width: 1280, height: 900 },
] as const;

const THEMES: readonly ResolvedTheme[] = ["light", "dark"];

// Sem asserção visual e sem baseline: o objetivo é gerar imagem para humano olhar.
for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`kitchen sink ${viewport.name} ${theme}`, async ({ page }) => {
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

      await page.goto("/kitchen-sink");
      await page.waitForLoadState("networkidle");

      await page.screenshot({
        path: `screenshots/kitchen-sink-${viewport.name}-${theme}.png`,
        fullPage: true,
      });
    });
  }
}
