import { inArray } from "drizzle-orm";
import { expect, test, type Page } from "@playwright/test";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import { signInForFeature } from "./feature-session";
import { THEME_STORAGE_KEY, type ResolvedTheme } from "@/lib/theme";
import { closeFixtureDb, fixtureDb, schema } from "./db-fixture.ts";
import { civilDateOf, parseDayParam, startOfDayInApp } from "@/lib/datetime";

/**
 * Capturas do B7: mês vazio, mês cheio, dia selecionado e o mês com hoje
 * visível, em três larguras e dois temas. Mais a captura em escala de cinza,
 * que é a que prova a distinção de forma entre confirmada e candidata.
 *
 * As opções entram direto no banco: o que está sob captura é como a grade se
 * comporta com N entradas, não o fluxo de criação — que o `dates.spec.ts` já
 * cobre. Os planos são próprios da execução e removidos ao final (D-082).
 */
const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (c) => c.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const AUTOR = "seed_profile_alex";

const MES_CHEIO = "2027-05";
const MES_VAZIO = "2031-02";

const PLANOS = [
  crypto.randomUUID(),
  crypto.randomUUID(),
  crypto.randomUUID(),
] as const;

const VIEWPORTS = [
  { name: "320", width: 320 },
  { name: "390", width: 390 },
  { name: "1280", width: 1280 },
] as const;

const THEMES: readonly ResolvedTheme[] = ["light", "dark"];

const TITULOS = [
  "Cinema na praça",
  "Jantar de aniversário",
  "Trilha ao amanhecer",
];

/** Hora de parede em São Paulo pelo módulo do tempo, sem offset fixo (D-059). */
function sp(dia: string, hora: number, minuto = 0): Date {
  const civil = parseDayParam(dia);
  if (!civil) throw new Error(`Dia inválido na fixture: ${dia}`);

  return new Date(
    startOfDayInApp(civil).getTime() + (hora * 60 + minuto) * 60_000,
  );
}

async function signIn(page: Page): Promise<void> {
  await signInForFeature(page, account);
}

test.beforeAll(async () => {
  const db = fixtureDb();

  await db.insert(schema.plans).values(
    PLANOS.map((id, i) => ({
      id,
      workspaceId: WORKSPACE,
      createdBy: AUTOR,
      title: TITULOS[i]!,
      category: ["cultura", "gastronomia", "ar_livre"][i]!,
      status: "deciding" as const,
    })),
  );

  const hoje = civilDateOf(new Date());

  await db.insert(schema.planDateOptions).values(
    [
      // Um mês com densidade de verdade: dias com uma, duas e três entradas.
      { planId: PLANOS[0]!, startsAt: sp("2027-05-06", 20), isConfirmed: true },
      { planId: PLANOS[1]!, startsAt: sp("2027-05-12", 20), isConfirmed: true },
      { planId: PLANOS[0]!, startsAt: sp("2027-05-12", 22) },
      { planId: PLANOS[2]!, startsAt: sp("2027-05-15", 7) },
      { planId: PLANOS[1]!, startsAt: sp("2027-05-15", 19) },
      { planId: PLANOS[0]!, startsAt: sp("2027-05-15", 21) },
      { planId: PLANOS[2]!, startsAt: sp("2027-05-22", 9) },
      { planId: PLANOS[1]!, startsAt: sp("2027-05-28", 20, 30) },
      // A virada do mês: 23:30 de 31/05 é 01/06 em UTC.
      { planId: PLANOS[0]!, startsAt: sp("2027-05-31", 23, 30) },
      // Hoje, para a captura do mês corrente mostrar o ponto coral com conteúdo.
      {
        planId: PLANOS[1]!,
        startsAt: new Date(startOfDayInApp(hoje).getTime() + 20 * 3_600_000),
      },
    ].map((o) => ({ ...o, workspaceId: WORKSPACE, createdBy: AUTOR })),
  );
});

test.afterAll(async () => {
  const db = fixtureDb();
  await db
    .delete(schema.activityEvents)
    .where(inArray(schema.activityEvents.subjectId, [...PLANOS]));
  await db.delete(schema.plans).where(inArray(schema.plans.id, [...PLANOS]));
  await closeFixtureDb();
});

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`agenda ${viewport.name} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: 1000 });
      await page.addInitScript(
        ({ key, value }: { key: string; value: string }) => {
          window.localStorage.setItem(key, value);
        },
        { key: THEME_STORAGE_KEY, value: theme },
      );

      await signIn(page);

      for (const [nome, url] of [
        ["mes-cheio", `/agenda?mes=${MES_CHEIO}`],
        ["mes-vazio", `/agenda?mes=${MES_VAZIO}`],
        ["dia-selecionado", `/agenda?mes=${MES_CHEIO}&dia=2027-05-15`],
        ["mes-com-hoje", "/agenda"],
      ] as const) {
        await page.goto(url);
        await expect(page.locator("table.calendar-table")).toBeVisible();
        await page.waitForTimeout(250);

        await page.screenshot({
          path: `screenshots/agenda-${nome}-${viewport.name}-${theme}.png`,
          fullPage: true,
        });
      }
    });
  }
}

test("escala de cinza: confirmada e candidata continuam distinguíveis", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await signIn(page);
  await page.goto(`/agenda?mes=${MES_CHEIO}`);
  await expect(page.locator("table.calendar-table")).toBeVisible();

  /* A cor sai por filtro; se a distinção dependesse de cor, a captura ficaria
     com dois pontos idênticos. Como ela é de forma — preenchido contra
     contornado —, sobrevive (seção 8). */
  await page.addStyleTag({
    content: "html { filter: grayscale(1) !important; }",
  });
  await page.waitForTimeout(250);

  await page.screenshot({
    path: "screenshots/agenda-escala-de-cinza-1280.png",
    fullPage: true,
  });

  /* E a prova em número, não só na imagem. Escopado à lista do desktop: no
     DOM os marcadores existem duas vezes, porque a densidade do mobile e a do
     desktop são estruturas diferentes e a alternância é por CSS. */
  const dia12 = page.locator('[data-day="2027-05-12"]');
  const fundos = await dia12
    .locator(".calendar-entry .calendar-marker")
    .evaluateAll((nodes) =>
      nodes.map((n) => getComputedStyle(n).backgroundColor),
    );

  expect(fundos.filter((c) => c === "rgba(0, 0, 0, 0)")).toHaveLength(1);
  expect(fundos.filter((c) => c !== "rgba(0, 0, 0, 0)")).toHaveLength(1);
});
