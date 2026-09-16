import { expect, test, type Page } from "./harness.ts";
import { signInForFeature } from "./feature-session.ts";
import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const account = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS)[0]!;
const routes = [
  ["home", "/"],
  ["ideias", "/ideias"],
  ["nova-ideia", "/novo"],
  ["detalhe", "/planos/22222222-0000-4000-8000-000000000003"],
  ["perfil", "/perfil"],
  ["agenda", "/agenda"],
  ["memorias", "/memorias"],
  ["kitchen-sink", "/kitchen-sink"],
] as const;

async function capture(page: Page, name: string, width: number, theme: string) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("img").evaluateAll(async (images) => {
    await Promise.all(
      images.map(async (img) => {
        if (!(img instanceof HTMLImageElement)) return;
        img.loading = "eager";
        await img.decode().catch(() => {});
      }),
    );
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `screenshots/r1/${name}-${width}-${theme}.png`,
    fullPage: true,
  });
  const audit = await page.evaluate(() => {
    const small: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      "a,button,input,textarea,summary,[role=combobox]",
    )) {
      if (!el.checkVisibility()) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      const type = (el as HTMLInputElement).type;
      const target =
        type === "checkbox" || type === "radio"
          ? (el.closest("label") ?? el)
          : el;
      const r = target.getBoundingClientRect();
      if (r.width < 43.9 || r.height < 43.9)
        small.push(
          el.tagName +
            ":" +
            el.textContent?.trim().slice(0, 30) +
            ":" +
            r.width +
            "x" +
            r.height,
        );
    }
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      small,
      nativeSelects: [...document.querySelectorAll("select")].filter(
        (el) => el.checkVisibility() && el.getBoundingClientRect().width > 1,
      ).length,
      broken: [...document.images]
        .filter(
          (img) =>
            img.checkVisibility() && img.complete && img.naturalWidth === 0,
        )
        .map((img) => img.alt),
    };
  });
  expect(audit.overflow, name).toBe(false);
  expect(audit.small, name).toEqual([]);
  expect(audit.nativeSelects, name).toBe(0);
  expect(audit.broken, name).toEqual([]);
}

for (const width of [320, 390, 1280])
  for (const theme of ["light", "dark"]) {
    test(`R1 telas ${width} ${theme}`, async ({ page }) => {
      test.setTimeout(180000);
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        ({ key, value }) => localStorage.setItem(key, value),
        { key: THEME_STORAGE_KEY, value: theme },
      );
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/login");
      await capture(page, "login", width, theme);
      /* Sessao reaproveitada: este spec captura telas, nao testa login. Com o
         login proprio, a matriz completa acumulava logins novos no Neon Auth e
         um deles estourava os 30 s (B11). A captura de /login acima continua
         acontecendo antes, com o contexto ainda sem sessao. */
      await signInForFeature(page, account);
      for (const [name, url] of routes) {
        await page.goto(url);
        await capture(page, name, width, theme);
        if (name === "detalhe") {
          await page.getByText("Editar detalhes", { exact: true }).click();
          await capture(page, "detalhe-edicao", width, theme);
        }
      }
      const select = page.getByRole("combobox", {
        name: "Categoria",
        exact: true,
      });
      await select.click();
      await expect(page.locator("[data-date-select-motion]")).toHaveCSS(
        "opacity",
        "1",
      );
      await page.screenshot({
        path: `screenshots/r1/select-aberto-${width}-${theme}.png`,
      });
      await page.keyboard.press("Escape");
      expect(errors).toEqual([]);
    });
  }

for (const width of [768, 1440])
  test(`R1 larguras intermediárias ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await capture(page, "login", width, "light");
  });
