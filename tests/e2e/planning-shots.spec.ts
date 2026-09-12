import { eq } from "drizzle-orm";
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

/** Matriz visual dos estados do B8, com fixtures exclusivas da execução. */
const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (candidate) =>
      candidate.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const AUTHOR = "seed_profile_alex";
const NO_RESERVATION = crypto.randomUUID();
const PENDING = crypto.randomUUID();
const CONFIRMED = crypto.randomUUID();
const PLANS = [NO_RESERVATION, PENDING, CONFIRMED] as const;

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

  const [member] = await db
    .select({ profileId: schema.workspaceMembers.profileId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, WORKSPACE))
    .limit(1);
  if (!member) throw new Error("A fixture exige um membro no workspace dev.");

  await db
    .update(schema.plans)
    .set({
      title: "Passeio sem reserva",
      status: "idea",
      requiresBooking: false,
      estimatedBudgetCents: null,
    })
    .where(eq(schema.plans.id, NO_RESERVATION));
  await db
    .update(schema.plans)
    .set({
      title: "Jantar com reserva pendente",
      status: "planned",
      requiresBooking: true,
      estimatedBudgetCents: 50_000,
    })
    .where(eq(schema.plans.id, PENDING));
  await db
    .update(schema.plans)
    .set({
      title: "Noite já reservada",
      status: "reserved",
      requiresBooking: true,
      estimatedBudgetCents: 28_000,
    })
    .where(eq(schema.plans.id, CONFIRMED));

  await db.insert(schema.planDateOptions).values([
    {
      workspaceId: WORKSPACE,
      planId: PENDING,
      startsAt: new Date("2027-08-14T23:30:00Z"),
      isConfirmed: true,
      createdBy: AUTHOR,
    },
    {
      workspaceId: WORKSPACE,
      planId: CONFIRMED,
      startsAt: new Date("2027-08-21T23:30:00Z"),
      isConfirmed: true,
      createdBy: AUTHOR,
    },
  ]);
  await db.insert(schema.reservations).values([
    {
      workspaceId: WORKSPACE,
      planId: PENDING,
      status: "pending",
      notes: "Aguardando a resposta do restaurante.",
      createdBy: AUTHOR,
    },
    {
      workspaceId: WORKSPACE,
      planId: CONFIRMED,
      status: "confirmed",
      code: "DATE-214",
      reservedTime: "20:30",
      notes: "Mesa na varanda.",
      createdBy: AUTHOR,
    },
  ]);
  await db.insert(schema.checklistItems).values([
    {
      workspaceId: WORKSPACE,
      planId: PENDING,
      label: "Confirmar o estacionamento",
      position: 0,
    },
    {
      workspaceId: WORKSPACE,
      planId: PENDING,
      label: "Separar uma roupa bonita",
      position: 1,
      doneAt: new Date(),
      doneBy: member.profileId,
    },
    {
      workspaceId: WORKSPACE,
      planId: CONFIRMED,
      label: "Salvar o código da reserva",
      position: 0,
      doneAt: new Date(),
      doneBy: member.profileId,
    },
    {
      workspaceId: WORKSPACE,
      planId: CONFIRMED,
      label: "Carregar o celular",
      position: 1,
      doneAt: new Date(),
      doneBy: member.profileId,
    },
  ]);
  await db.insert(schema.expenses).values([
    {
      workspaceId: WORKSPACE,
      planId: PENDING,
      label: "Sinal da reserva",
      amountCents: 10_000,
      paidBy: member.profileId,
    },
    {
      workspaceId: WORKSPACE,
      planId: PENDING,
      label: "Ingressos",
      amountCents: 12_000,
    },
    {
      workspaceId: WORKSPACE,
      planId: CONFIRMED,
      label: "Jantar",
      amountCents: 28_000,
      paidBy: member.profileId,
    },
    {
      workspaceId: WORKSPACE,
      planId: CONFIRMED,
      label: "Estacionamento",
      amountCents: 4_000,
    },
  ]);
});

test.afterAll(async () => {
  await removeOwnedPlans(PLANS);
  await closeFixtureDb();
});

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`planejamento ${viewport.name} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: 1000 });
      await page.addInitScript(
        ({ key, value }: { key: string; value: string }) => {
          window.localStorage.setItem(key, value);
        },
        { key: THEME_STORAGE_KEY, value: theme },
      );
      await signIn(page);

      for (const [name, planId] of [
        ["sem-reserva-e-vazio", NO_RESERVATION],
        ["reserva-pendente-e-itens", PENDING],
        ["reserva-confirmada-e-acima", CONFIRMED],
      ] as const) {
        await page.goto(`/planos/${planId}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");

        await page.addStyleTag({
          content: `
            body > div { position: relative !important; }
            nav[aria-label="Navegação principal"] { position: static !important; }
            aside[data-shell="sidebar"] { position: absolute !important; }
          `,
        });

        await page.screenshot({
          path: `screenshots/planejamento-${name}-${viewport.name}-${theme}.png`,
          fullPage: true,
        });
      }
    });
  }
}
