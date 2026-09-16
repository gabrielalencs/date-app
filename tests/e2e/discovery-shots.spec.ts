import { eq } from "drizzle-orm";
import { expect, test, type Page } from "./harness.ts";

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

const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (candidate) =>
      candidate.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const EMPTY_PLAN = crypto.randomUUID();
const HISTORY_PLAN = crypto.randomUUID();
const CARD_PLAN = crypto.randomUUID();
const PLANS = [EMPTY_PLAN, HISTORY_PLAN, CARD_PLAN] as const;
const UNIQUE_CITY = `B10 Visual ${CARD_PLAN.slice(0, 8)}`;

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
  await prepareOwnedPlans(PLANS);
  const db = fixtureDb();
  const members = await db
    .select({ profileId: schema.workspaceMembers.profileId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, WORKSPACE))
    .limit(2);
  if (members.length < 2) {
    throw new Error(
      "As capturas do B10 exigem os dois membros do workspace dev.",
    );
  }

  await db
    .update(schema.plans)
    .set({
      title: "Um DATE que acabou de nascer",
      city: UNIQUE_CITY,
      category: "ar_livre",
      estimatedBudgetCents: 8_000,
    })
    .where(eq(schema.plans.id, EMPTY_PLAN));
  await db
    .update(schema.plans)
    .set({
      title: "A história inteira de uma noite",
      city: UNIQUE_CITY,
      category: "gastronomia",
      estimatedBudgetCents: 32_000,
    })
    .where(eq(schema.plans.id, HISTORY_PLAN));
  await db
    .update(schema.plans)
    .set({
      title: "A ideia que os dois querem muito",
      city: UNIQUE_CITY,
      category: "cultura",
      estimatedBudgetCents: 18_000,
      priority: 3,
    })
    .where(eq(schema.plans.id, CARD_PLAN));

  await db.insert(schema.reactions).values(
    members.map((member) => ({
      workspaceId: WORKSPACE,
      planId: CARD_PLAN,
      profileId: member.profileId,
      type: "want_a_lot" as const,
    })),
  );

  const verbs = [
    "plan_created",
    "date_suggested",
    "vote_cast",
    "date_confirmed",
    "booking_updated",
    "want_a_lot",
    "plan_completed",
    "memory_added",
  ] as const;
  const now = Date.now();

  await db.insert(schema.activityEvents).values(
    Array.from({ length: 28 }, (_, index) => {
      const verb = verbs[index % verbs.length]!;
      const startsAt = new Date("2027-06-14T23:30:00.000Z").toISOString();
      const metadata =
        verb === "date_suggested"
          ? { planId: HISTORY_PLAN, startsAt, allDay: false }
          : verb === "vote_cast"
            ? { planId: HISTORY_PLAN, startsAt, vote: "yes" }
            : verb === "date_confirmed"
              ? { planId: HISTORY_PLAN, startsAt }
              : verb === "booking_updated"
                ? { status: "confirmed" }
                : null;

      return {
        workspaceId: WORKSPACE,
        actorProfileId: members[index % members.length]!.profileId,
        verb,
        subjectType:
          verb === "date_suggested" ||
          verb === "vote_cast" ||
          verb === "date_confirmed"
            ? "plan_date_option"
            : "plan",
        subjectId:
          verb === "date_suggested" ||
          verb === "vote_cast" ||
          verb === "date_confirmed"
            ? crypto.randomUUID()
            : HISTORY_PLAN,
        metadata,
        createdAt: new Date(now - index * 3_600_000),
      };
    }),
  );
});

test.afterAll(async () => {
  await removeOwnedPlans(PLANS);
  await closeFixtureDb();
});

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`descoberta ${viewport.name} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: 1000 });
      await page.addInitScript(
        ({ key, value }: { key: string; value: string }) => {
          window.localStorage.setItem(key, value);
        },
        { key: THEME_STORAGE_KEY, value: theme },
      );
      await signIn(page);

      for (const [name, route] of [
        ["plano-feed-vazio", `/planos/${EMPTY_PLAN}`],
        ["plano-historia-longa", `/planos/${HISTORY_PLAN}`],
        [
          "card-quero-muito",
          `/ideias?cidade=${encodeURIComponent(UNIQUE_CITY)}`,
        ],
        [
          "favoritos-vazio",
          `/ideias?cidade=${encodeURIComponent(UNIQUE_CITY)}&favoritos=1`,
        ],
      ] as const) {
        await page.goto(route);
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
          path: `screenshots/descoberta-${name}-${viewport.name}-${theme}.png`,
          fullPage: true,
        });
      }
    });
  }
}

test("escala de cinza: quero muito continua sendo coração e texto", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await signIn(page);
  await page.goto(`/ideias?cidade=${encodeURIComponent(UNIQUE_CITY)}`);
  await page.addStyleTag({
    content: `
      html { filter: grayscale(1); }
      body > div { position: relative !important; }
      nav[aria-label="Navegação principal"] { position: static !important; }
      aside[data-shell="sidebar"] { position: absolute !important; }
    `,
  });

  const card = page
    .getByRole("link")
    .filter({ hasText: "A ideia que os dois querem muito" });
  const mark = card.locator("span").filter({ hasText: /querem muito/ });
  await expect(mark).toBeVisible();
  await expect(mark.locator("svg")).toHaveAttribute("fill", "currentColor");

  await page.screenshot({
    path: "screenshots/descoberta-card-quero-muito-390-grayscale.png",
    fullPage: true,
  });
});
