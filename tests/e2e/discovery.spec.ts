import { and, eq } from "drizzle-orm";
import { expect, test, type Page } from "@playwright/test";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import {
  closeFixtureDb,
  fixtureDb,
  prepareOwnedPlans,
  removeOwnedPlans,
  schema,
} from "./db-fixture.ts";
import { signInForFeature } from "./feature-session";

const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const primaryAccount =
  credentials.find(
    (candidate) =>
      candidate.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;
const secondaryAccount = credentials.find(
  (candidate) => candidate.email !== primaryAccount.email,
);

const REACTION_PLAN = crypto.randomUUID();
const EMPTY_PLAN = crypto.randomUUID();
const PLANS = [REACTION_PLAN, EMPTY_PLAN] as const;
const UNIQUE_CITY = `B10 ${REACTION_PLAN.slice(0, 8)}`;

async function signIn(page: Page): Promise<void> {
  await signInForFeature(page, primaryAccount);
}

async function countEvents(): Promise<number> {
  const rows = await fixtureDb()
    .select({ id: schema.activityEvents.id })
    .from(schema.activityEvents)
    .where(eq(schema.activityEvents.subjectId, REACTION_PLAN));
  return rows.length;
}

async function expectHealthyPage(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status(), `status de ${path}`).toBeLessThan(400);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test.describe.serial("descoberta, reações e atividade", () => {
  test.beforeAll(async () => {
    if (!secondaryAccount) {
      throw new Error(
        "O B10 exige duas contas de development para a prova do ator.",
      );
    }

    await prepareOwnedPlans(PLANS);
    await fixtureDb()
      .update(schema.plans)
      .set({
        title: "Cinema secreto do B10",
        category: "cinema_teatro",
        city: UNIQUE_CITY,
        estimatedBudgetCents: 12_500,
        priority: 3,
      })
      .where(eq(schema.plans.id, REACTION_PLAN));
    await fixtureDb()
      .update(schema.plans)
      .set({
        title: "Plano novo sem história",
        category: "em_casa",
        city: `Fora ${UNIQUE_CITY}`,
        estimatedBudgetCents: 90_000,
      })
      .where(eq(schema.plans.id, EMPTY_PLAN));
  });

  test.afterAll(async () => {
    await removeOwnedPlans(PLANS);
    await closeFixtureDb();
  });

  test("favorito é pessoal; quero muito é compartilhado e identifica o ator", async ({
    page,
    browser,
  }) => {
    await signIn(page);
    await page.goto(`/planos/${REACTION_PLAN}`);

    const favorite = page.getByRole("button", { name: "Favoritar" });
    const want = page.getByRole("button", { name: "Quero muito" });
    await expect(favorite).toHaveAttribute("aria-pressed", "false");
    await expect(want).toHaveAttribute("aria-pressed", "false");

    const beforeFavorite = await countEvents();
    await favorite.click();
    const removeFavorite = page.getByRole("button", {
      name: "Remover dos favoritos",
    });
    await expect(removeFavorite).toHaveAttribute("aria-pressed", "true", {
      timeout: 30_000,
    });
    expect(await countEvents(), "favoritar precisa ser silencioso").toBe(
      beforeFavorite,
    );

    await want.click();
    await expect(
      page.getByRole("button", { name: "Retirar quero muito" }),
    ).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
    await expect(
      page.getByText("marcou que quer muito este DATE"),
    ).toBeVisible();

    const afterWant = await countEvents();
    expect(afterWant, "quero muito precisa emitir um evento").toBe(
      beforeFavorite + 1,
    );

    const [event] = await fixtureDb()
      .select({
        actorId: schema.activityEvents.actorProfileId,
        actorName: schema.profiles.displayName,
      })
      .from(schema.activityEvents)
      .innerJoin(
        schema.profiles,
        eq(schema.profiles.id, schema.activityEvents.actorProfileId),
      )
      .where(
        and(
          eq(schema.activityEvents.subjectId, REACTION_PLAN),
          eq(schema.activityEvents.verb, "want_a_lot"),
        ),
      );
    expect(event).toBeTruthy();

    await page.goto(
      `/ideias?favoritos=1&cidade=${encodeURIComponent(UNIQUE_CITY)}`,
    );
    await expect(
      page.getByText("Cinema secreto do B10", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Seu favorito", { exact: true })).toBeVisible();

    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    await signInForFeature(secondPage, secondaryAccount!);
    await secondPage.goto(`/planos/${REACTION_PLAN}`);
    await expect(
      secondPage.getByText(
        `${event!.actorName} marcou que quer muito este DATE`,
      ),
    ).toBeVisible();

    await secondPage.goto(
      `/ideias?favoritos=1&cidade=${encodeURIComponent(UNIQUE_CITY)}`,
    );
    await expect(
      secondPage.getByText("Cinema secreto do B10", { exact: true }),
    ).toHaveCount(0);
    await secondContext.close();

    await page.goto(`/planos/${REACTION_PLAN}`);
    await page.getByRole("button", { name: "Remover dos favoritos" }).click();
    await expect(
      page.getByRole("button", { name: "Favoritar" }),
    ).toHaveAttribute("aria-pressed", "false", { timeout: 30_000 });
    expect(await countEvents(), "retirar favorito também é silencioso").toBe(
      afterWant,
    );
  });

  test("sorteio respeita filtros, estabiliza na URL e trata conjunto vazio", async ({
    page,
  }) => {
    await signIn(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/ideias?cidade=${encodeURIComponent(UNIQUE_CITY)}`);
    await expect(
      page.getByText("Cinema secreto do B10", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sortear uma ideia" }).click();
    await page.waitForURL(
      (url) => url.pathname === `/planos/${REACTION_PLAN}`,
      {
        timeout: 30_000,
      },
    );

    for (let reload = 0; reload < 10; reload += 1) {
      await page.reload();
      expect(new URL(page.url()).pathname).toBe(`/planos/${REACTION_PLAN}`);
    }

    await page.goto("/ideias?cidade=nenhuma-cidade-do-b10");
    await page.getByRole("button", { name: "Sortear uma ideia" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Nenhuma ideia combina com esses filtros",
    );
    expect(new URL(page.url()).pathname).toBe("/ideias");
  });

  test("URLs hostis degradam para defaults sem erro", async ({ page }) => {
    await signIn(page);

    for (const path of [
      "/ideias?favoritos=abc",
      "/ideias?favoritos=0",
      "/ideias?teto=1%2C234&status=inventado&ordem=surpresa",
      `/planos/${REACTION_PLAN}?pagina`,
      `/planos/${REACTION_PLAN}?pagina=-1`,
      `/planos/${REACTION_PLAN}?pagina=abc`,
      `/planos/${REACTION_PLAN}?pagina=999999`,
    ]) {
      await expectHealthyPage(page, path);
    }
  });

  for (const width of [320, 390, 1280] as const) {
    test(`medidas, foco e estado das reações em ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await signIn(page);
      await page.goto(`/planos/${REACTION_PLAN}`);

      const measurements = await page.evaluate(() => {
        const tooSmall: string[] = [];
        const tinyText: string[] = [];

        for (const element of document.querySelectorAll<HTMLElement>(
          "button, a, input, textarea, [role='button'], [role='combobox']",
        )) {
          const box = element.getBoundingClientRect();
          if (box.width <= 1 && box.height <= 1) continue;
          const input = element as HTMLInputElement;
          const target =
            input.type === "checkbox" || input.type === "radio"
              ? (element.closest("label") ?? element)
              : element;
          const targetBox = target.getBoundingClientRect();
          if (targetBox.width < 44 || targetBox.height < 44) {
            tooSmall.push(
              `${element.tagName.toLowerCase()}[${element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 24) ?? ""}] ${Math.round(targetBox.width)}x${Math.round(targetBox.height)}`,
            );
          }
        }

        for (const element of document.querySelectorAll<HTMLElement>("*")) {
          if (!element.textContent?.trim() || element.children.length > 0)
            continue;
          const fontSize = Number.parseFloat(
            getComputedStyle(element).fontSize,
          );
          if (fontSize > 0 && fontSize < 12) {
            tinyText.push(`${element.tagName.toLowerCase()} ${fontSize}px`);
          }
        }

        return {
          tooSmall,
          tinyText,
          horizontalScroll:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        };
      });

      expect(measurements.tooSmall, "alvos abaixo de 44px").toEqual([]);
      expect(measurements.tinyText, "texto abaixo de 12px").toEqual([]);
      expect(measurements.horizontalScroll, "scroll horizontal").toBe(false);

      const want = page.getByRole("button", {
        name: /^(Quero muito|Retirar quero muito)$/,
      });
      await want.focus();
      const focus = await want.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
        };
      });
      expect(focus.outlineStyle).not.toBe("none");
      expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);

      const before = await want.getAttribute("aria-pressed");
      await want.click();
      await expect(want).toHaveAttribute(
        "aria-pressed",
        before === "true" ? "false" : "true",
        { timeout: 30_000 },
      );
    });
  }
});
