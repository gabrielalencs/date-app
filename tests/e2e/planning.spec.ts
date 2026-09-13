import { eq, inArray } from "drizzle-orm";
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

/**
 * Fluxos do B8 pela interface real.
 *
 * A camada de dados tem a prova de isolamento e invariantes. Aqui ficam as
 * coisas que só um navegador mede: serialização dos formulários, atualização
 * do RSC depois da Server Action, checkbox, Select DATE, input decimal, foco e
 * geometria em mobile.
 */
const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (candidate) =>
      candidate.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const AUTHOR = "seed_profile_alex";
const FLOW_PLAN = crypto.randomUUID();
const MEASURE_PLAN = crypto.randomUUID();
const PLANS = [FLOW_PLAN, MEASURE_PLAN] as const;

async function signIn(page: Page): Promise<void> {
  await signInForFeature(page, account);
}

async function resetPlans(): Promise<void> {
  const db = fixtureDb();

  await db
    .delete(schema.activityEvents)
    .where(inArray(schema.activityEvents.subjectId, [...PLANS]));
  await db
    .delete(schema.reservations)
    .where(inArray(schema.reservations.planId, [...PLANS]));
  await db
    .delete(schema.checklistItems)
    .where(inArray(schema.checklistItems.planId, [...PLANS]));
  await db
    .delete(schema.expenses)
    .where(inArray(schema.expenses.planId, [...PLANS]));
  await db
    .update(schema.plans)
    .set({
      status: "planned",
      requiresBooking: true,
      estimatedBudgetCents: 28_000,
      archivedAt: null,
    })
    .where(inArray(schema.plans.id, [...PLANS]));
}

async function populateMeasurePlan(): Promise<void> {
  const db = fixtureDb();
  const [member] = await db
    .select({ profileId: schema.workspaceMembers.profileId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, WORKSPACE))
    .limit(1);

  if (!member) throw new Error("A fixture exige um membro no workspace dev.");

  await db
    .update(schema.plans)
    .set({ status: "reserved" })
    .where(eq(schema.plans.id, MEASURE_PLAN));
  await db.insert(schema.reservations).values({
    workspaceId: WORKSPACE,
    planId: MEASURE_PLAN,
    status: "confirmed",
    code: "MESA-20",
    reservedTime: "20:30",
    createdBy: AUTHOR,
  });
  await db.insert(schema.checklistItems).values([
    {
      workspaceId: WORKSPACE,
      planId: MEASURE_PLAN,
      /* "estacionamento" tem 14 caracteres e ~90px: é a palavra que não cabe
         na coluna estreita de 320px, e é ela que faz a medida de quebra no meio
         da palavra medir alguma coisa. Com "ingressos" o teste passava sem
         exercitar o caso — verde pelo motivo errado. */
      label: "Confirmar o estacionamento",
      position: 0,
      doneAt: new Date("2027-06-11T12:00:00Z"),
      doneBy: member.profileId,
    },
    {
      workspaceId: WORKSPACE,
      planId: MEASURE_PLAN,
      label: "Separar uma roupa bonita",
      position: 1,
    },
  ]);
  await db.insert(schema.expenses).values([
    {
      workspaceId: WORKSPACE,
      planId: MEASURE_PLAN,
      label: "Jantar",
      amountCents: 28_000,
      paidBy: member.profileId,
    },
    {
      workspaceId: WORKSPACE,
      planId: MEASURE_PLAN,
      label: "Estacionamento",
      amountCents: 4_000,
    },
  ]);
}

test.beforeAll(async () => {
  const db = fixtureDb();
  await prepareOwnedPlans(PLANS);
  await db
    .update(schema.plans)
    .set({ requiresBooking: true, estimatedBudgetCents: 28_000 })
    .where(inArray(schema.plans.id, [...PLANS]));
  await db.insert(schema.planDateOptions).values(
    PLANS.map((planId, index) => ({
      workspaceId: WORKSPACE,
      planId,
      startsAt: new Date(`2027-06-${12 + index}T23:30:00Z`),
      isConfirmed: true,
      createdBy: AUTHOR,
    })),
  );
  await resetPlans();
});

test.beforeEach(async () => {
  await resetPlans();
});

test.afterAll(async () => {
  await resetPlans();
  await removeOwnedPlans(PLANS);
  await closeFixtureDb();
});

test("reserva move o status nos dois sentidos e a interface respeita os fatos", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/planos/${FLOW_PLAN}`);

  const planStatus = page.locator("[data-status]").first();
  const reservationStatus = page.locator("[data-reservation-status]");

  await expect(planStatus).toHaveAttribute("data-status", "planned");
  await expect(
    page.getByRole("button", { name: "Reservado", exact: true }),
  ).toHaveCount(0);

  await page.getByLabel("Código").fill("RES-2027");
  await page.getByLabel("Horário").fill("20:30");
  await page.getByLabel("Link").fill("https://example.com/reserva");
  await page
    .getByRole("region", { name: "Reserva" })
    .getByLabel("Observações")
    .fill("Mesa perto da janela");
  await page.getByRole("button", { name: "Salvar reserva" }).click();

  await expect(page.getByText("RES-2027", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Mesa perto da janela")).toBeVisible();
  await expect(reservationStatus).toHaveAttribute(
    "data-reservation-status",
    "pending",
  );

  await page.getByRole("button", { name: "Não deu certo" }).click();
  await expect(reservationStatus).toHaveAttribute(
    "data-reservation-status",
    "cancelled",
    { timeout: 30_000 },
  );
  await expect(planStatus).toHaveAttribute("data-status", "planned");

  await page.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(reservationStatus).toHaveAttribute(
    "data-reservation-status",
    "pending",
    { timeout: 30_000 },
  );

  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(reservationStatus).toHaveAttribute(
    "data-reservation-status",
    "confirmed",
    { timeout: 30_000 },
  );
  await expect(planStatus).toHaveAttribute("data-status", "reserved");
  await expect(
    page.getByRole("button", { name: "Planejado", exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Desfazer reserva" }).click();
  await expect(reservationStatus).toHaveAttribute(
    "data-reservation-status",
    "pending",
    { timeout: 30_000 },
  );
  await expect(planStatus).toHaveAttribute("data-status", "planned");

  await page.getByRole("button", { name: "Desmarcar" }).click();
  await expect(planStatus).toHaveAttribute("data-status", "deciding", {
    timeout: 30_000,
  });
});

test("checklist acrescenta, marca com autoria, reordena e apaga", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/planos/${FLOW_PLAN}`);

  const newItem = page.getByLabel("Novo item");
  await newItem.fill("Levar água");
  await page.getByRole("button", { name: "Acrescentar" }).click();
  await expect(page.getByText("Levar água", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(newItem).toHaveValue("");

  await newItem.fill("Separar ingressos");
  await page.getByRole("button", { name: "Acrescentar" }).click();
  await expect(page.locator("[data-checklist-item]")).toHaveCount(2, {
    timeout: 30_000,
  });
  await expect(page.locator("[data-checklist-count]")).toHaveText("0 de 2");

  await page.getByLabel("Levar água", { exact: true }).check();
  const water = page
    .locator("[data-checklist-item]")
    .filter({ hasText: "Levar água" });
  await expect(water).toHaveAttribute("data-done", "true", {
    timeout: 30_000,
  });
  await expect(water).toContainText("hoje");
  await expect(page.locator("[data-checklist-count]")).toHaveText("1 de 2");

  await page.getByRole("button", { name: "Subir Separar ingressos" }).click();
  await expect(page.locator("[data-checklist-item]").first()).toContainText(
    "Separar ingressos",
    { timeout: 30_000 },
  );

  await page.getByRole("button", { name: "Apagar Separar ingressos" }).click();
  await expect(page.locator("[data-checklist-item]")).toHaveCount(1, {
    timeout: 30_000,
  });
});

test("gastos aceitam vírgula, recusam formato ambíguo e somam centavos", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/planos/${FLOW_PLAN}`);

  const label = page.getByLabel("No que foi");
  const amount = page.getByLabel("Valor");
  await expect(amount).toHaveAttribute("type", "text");
  await expect(amount).toHaveAttribute("inputmode", "decimal");

  await label.fill("Ambíguo");
  await amount.fill("1,234");
  await page.getByRole("button", { name: "Lançar gasto" }).click();
  await expect(page.locator("p[role='alert']")).toContainText(
    "Escreva o valor como 80, 80,50 ou 1.234,56",
  );
  await expect(page.locator("[data-expense]")).toHaveCount(0);

  await label.fill("Jantar");
  await amount.fill("280,00");
  const payer = page.getByRole("combobox", { name: "Quem pagou" });
  await payer.click();
  const firstMember = page.getByRole("option").nth(1);
  const payerName = (await firstMember.textContent())?.trim() ?? "";
  await firstMember.click();
  await page.getByRole("button", { name: "Lançar gasto" }).click();
  await expect(page.getByText("Jantar", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("[data-expense]").first()).toContainText(
    `Pagou: ${payerName}`,
  );
  await expect(label).toHaveValue("");
  await expect(amount).toHaveValue("");

  await label.fill("Estacionamento");
  await amount.fill("40,00");
  await page.getByRole("button", { name: "Lançar gasto" }).click();

  await expect(page.locator("[data-expense-total]")).toHaveAttribute(
    "data-expense-total",
    "32000",
    { timeout: 30_000 },
  );
  await expect(page.locator("[data-expense-total]")).toContainText("R$ 320,00");
  await expect(page.getByText(/R\$\s*40,00 acima/)).toBeVisible();
});

for (const width of [320, 390, 1280] as const) {
  test(`medidas do planejamento em ${width}px`, async ({ page }) => {
    await populateMeasurePlan();
    await page.setViewportSize({ width, height: 1000 });
    await signIn(page);
    await page.goto(`/planos/${MEASURE_PLAN}`);

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
        const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
        if (fontSize > 0 && fontSize < 12) {
          tinyText.push(`${element.tagName.toLowerCase()} ${fontSize}px`);
        }
      }

      /* Quebra no meio da palavra.
         A 320px os três botões de ícone comem 132px da linha, e o rótulo do
         checklist ficava com ~80px — "estacionamento" quebrava em
         "estaciona|mento". `break-words` só parte no meio quando a palavra não
         cabe, então medir a palavra mais larga contra a coluna é exatamente a
         pergunta certa. */
      const midWordBreaks: string[] = [];
      for (const element of document.querySelectorAll<HTMLElement>(
        "[data-checklist-item] label span span:first-child, [data-expense] span span",
      )) {
        const available = element.getBoundingClientRect().width;
        if (available === 0) continue;

        /* Truncar é decisão, quebrar no meio é acidente. Um nome de exibição
           pode ser um token único sem espaço, e ali reticências são a resposta
           certa — o instrumento mede o acidente, não a decisão. */
        if (getComputedStyle(element).textOverflow === "ellipsis") continue;

        const probe = document.createElement("span");
        probe.style.cssText =
          "position:absolute;visibility:hidden;white-space:pre;left:-9999px";
        probe.style.font = getComputedStyle(element).font;
        document.body.append(probe);

        let widest = 0;
        for (const word of (element.textContent ?? "").trim().split(/\s+/)) {
          probe.textContent = word;
          widest = Math.max(widest, probe.getBoundingClientRect().width);
        }
        probe.remove();

        if (widest > available + 0.5) {
          midWordBreaks.push(
            `"${element.textContent?.trim().slice(0, 28)}" palavra ${Math.round(widest)}px > coluna ${Math.round(available)}px`,
          );
        }
      }

      const root = document.documentElement;
      return {
        tooSmall,
        tinyText,
        midWordBreaks,
        horizontalScroll: root.scrollWidth > root.clientWidth,
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
      };
    });

    expect(measurements.tooSmall, "alvos abaixo de 44px").toEqual([]);
    expect(measurements.tinyText, "texto abaixo de 12px").toEqual([]);
    expect(
      measurements.midWordBreaks,
      "rótulo quebrando no meio da palavra",
    ).toEqual([]);
    expect(
      measurements.horizontalScroll,
      `scroll horizontal: ${measurements.scrollWidth} > ${measurements.clientWidth}`,
    ).toBe(false);

    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const target = document.activeElement as HTMLElement | null;
      if (!target || target === document.body) return null;
      const style = getComputedStyle(target);
      return {
        outline: style.outlineStyle,
        shadow: style.boxShadow,
      };
    });

    expect(focus, "Tab não moveu o foco").not.toBeNull();
    expect(
      focus!.outline !== "none" || focus!.shadow !== "none",
      `foco sem indicador visível: ${JSON.stringify(focus)}`,
    ).toBe(true);

    const amount = page.getByLabel("Valor");
    await expect(amount).toHaveAttribute("type", "text");
    await expect(amount).toHaveAttribute("inputmode", "decimal");
    await amount.fill("80,50");
    await expect(amount).toHaveValue("80,50");
  });
}
