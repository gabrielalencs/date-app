import { and, eq, inArray } from "drizzle-orm";
import { expect, test, type Page } from "@playwright/test";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import { THEME_STORAGE_KEY, type ResolvedTheme } from "@/lib/theme";
import {
  closeFixtureDb,
  fixtureDb,
  prepareOwnedPlans,
  removeOwnedPlans,
  schema,
} from "./db-fixture.ts";
import { signInForFeature } from "./feature-session";

/**
 * Matriz visual do B9, com fixtures exclusivas da execução.
 *
 * Os estados que o relatório precisa mostrar: a timeline vazia, com poucas,
 * com muitas e com virada de mês; e o plano realizado sem avaliação, com uma,
 * com as duas.
 */
const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (candidate) =>
      candidate.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const AUTHOR = "seed_profile_alex";

const SEM_AVALIACAO = crypto.randomUUID();
const UMA_AVALIACAO = crypto.randomUUID();
const DUAS_AVALIACOES = crypto.randomUUID();
const PLANS = [SEM_AVALIACAO, UMA_AVALIACAO, DUAS_AVALIACOES] as const;

const VIEWPORTS = [
  { name: "320", width: 320 },
  { name: "390", width: 390 },
  { name: "1280", width: 1280 },
] as const;
const THEMES: readonly ResolvedTheme[] = ["light", "dark"];

async function signIn(page: Page): Promise<void> {
  await signInForFeature(page, account);
}

test.beforeAll(async () => {
  const db = fixtureDb();
  await prepareOwnedPlans(PLANS);

  const membros = await db
    .select({ profileId: schema.workspaceMembers.profileId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, WORKSPACE))
    .limit(2);

  if (membros.length < 2) {
    throw new Error("A fixture exige os dois membros do workspace dev.");
  }

  const um = membros[0]!;
  const dois = membros[1]!;

  for (const [id, title, city] of [
    [SEM_AVALIACAO, "Feira de rua no domingo", "São Paulo"],
    [UMA_AVALIACAO, "Jantar na cantina antiga", "São Paulo"],
    [DUAS_AVALIACOES, "Fim de tarde no mirante", "Campos do Jordão"],
  ] as const) {
    await db
      .update(schema.plans)
      .set({ title, city, status: "completed", estimatedBudgetCents: 18_000 })
      .where(eq(schema.plans.id, id));
  }

  /* As três datas caem em meses diferentes, e uma delas às 23:30 do último dia
     do mês — em UTC aquilo já é o mês seguinte, e é o que a captura precisa
     mostrar no cabeçalho certo. */
  await db.insert(schema.planDateOptions).values([
    {
      workspaceId: WORKSPACE,
      planId: SEM_AVALIACAO,
      startsAt: new Date("2026-09-06T15:00:00Z"),
      isConfirmed: true,
      createdBy: AUTHOR,
    },
    {
      workspaceId: WORKSPACE,
      planId: UMA_AVALIACAO,
      startsAt: new Date("2026-08-15T23:00:00Z"),
      isConfirmed: true,
      createdBy: AUTHOR,
    },
    {
      workspaceId: WORKSPACE,
      planId: DUAS_AVALIACOES,
      startsAt: new Date("2026-08-01T02:30:00Z"),
      isConfirmed: true,
      createdBy: AUTHOR,
    },
  ]);

  await db.insert(schema.memoryRatings).values([
    {
      workspaceId: WORKSPACE,
      planId: UMA_AVALIACAO,
      profileId: um.profileId,
      rating: 4,
      wouldRepeat: "yes",
      highlight: "A sobremesa que a gente dividiu.",
    },
    {
      workspaceId: WORKSPACE,
      planId: DUAS_AVALIACOES,
      profileId: um.profileId,
      rating: 5,
      wouldRepeat: "yes",
      highlight: "O silêncio lá em cima quando o sol caiu.",
      notes: "Levar casaco: esfria rápido depois das seis.",
    },
    {
      workspaceId: WORKSPACE,
      planId: DUAS_AVALIACOES,
      profileId: dois.profileId,
      rating: 4,
      wouldRepeat: "maybe",
      highlight: "A subida valeu, mesmo cansada.",
    },
  ]);
});

test.afterAll(async () => {
  const db = fixtureDb();
  await db
    .delete(schema.memoryRatings)
    .where(inArray(schema.memoryRatings.planId, [...PLANS]));
  await removeOwnedPlans(PLANS);
  await closeFixtureDb();
});

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`memórias ${viewport.name} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: 1000 });
      await page.addInitScript(
        ({ key, value }: { key: string; value: string }) => {
          window.localStorage.setItem(key, value);
        },
        { key: THEME_STORAGE_KEY, value: theme },
      );
      await signIn(page);

      await page.goto("/memorias");
      await expect(
        page.getByRole("heading", { level: 1, name: "Memórias" }),
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: `screenshots/b9/timeline-${viewport.name}-${theme}.png`,
        fullPage: true,
      });

      for (const [nome, planId] of [
        ["sem-avaliacao", SEM_AVALIACAO],
        ["uma-avaliacao", UMA_AVALIACAO],
        ["duas-avaliacoes", DUAS_AVALIACOES],
      ] as const) {
        await page.goto(`/planos/${planId}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");
        await page.screenshot({
          path: `screenshots/b9/${nome}-${viewport.name}-${theme}.png`,
          fullPage: true,
        });
      }
    });
  }
}

/**
 * A prova de que a nota não depende de cor: a mesma tela sem saturação
 * nenhuma. Se as cinco estrelas virarem o mesmo cinza, a distinção estava só
 * na cor — é a mesma verificação que o marcador do calendário recebeu.
 */
test("escala de cinza: a nota se lê pelo preenchimento", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await signIn(page);

  await page.addStyleTag({ content: "html { filter: grayscale(1); }" });
  await page.goto(`/planos/${DUAS_AVALIACOES}`);
  await page.addStyleTag({ content: "html { filter: grayscale(1); }" });

  await expect(page.getByRole("heading", { name: "Como foi?" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  await page.screenshot({
    path: "screenshots/b9/escala-de-cinza-390.png",
    fullPage: true,
  });

  // A média existe porque as duas avaliaram, e o número é legível sem cor.
  await expect(page.locator("[data-rating-average]")).toHaveAttribute(
    "data-rating-average",
    "4,5",
  );
});

/**
 * O estado vazio, que é texto escrito por gente e precisa ser lido inteiro.
 *
 * Um workspace sem nenhum date realizado não existe no banco de development, e
 * criar um só para a captura seria fixture grande demais. Os planos da execução
 * saem de `completed` por um instante, e voltam no fim.
 */
test("estado vazio de /memorias", async ({ page }) => {
  const db = fixtureDb();

  const realizados = await db
    .select({ id: schema.plans.id })
    .from(schema.plans)
    .where(
      and(
        eq(schema.plans.workspaceId, WORKSPACE),
        eq(schema.plans.status, "completed"),
      ),
    );

  const ids = realizados.map((linha) => linha.id);

  await db
    .update(schema.plans)
    .set({ archivedAt: new Date() })
    .where(inArray(schema.plans.id, ids));

  try {
    await page.setViewportSize({ width: 390, height: 1000 });
    await signIn(page);
    await page.goto("/memorias");

    await expect(
      page.getByText("Nada guardado por aqui ainda"),
    ).toBeVisible();
    await expect(page.getByText(/As memórias começam quando/)).toBeVisible();

    // Sem emoji e sem exclamação, como manda a seção 9.
    const texto = await page.locator("main").innerText();
    expect(texto).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);

    await page.screenshot({
      path: "screenshots/b9/timeline-vazia-390.png",
      fullPage: true,
    });
  } finally {
    await db
      .update(schema.plans)
      .set({ archivedAt: null })
      .where(inArray(schema.plans.id, ids));
  }
});
