import { eq, inArray } from "drizzle-orm";
import { expect, test, type Page } from "./harness.ts";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import { addCivilDays, civilDateOf, startOfDayInApp } from "@/lib/datetime";
import {
  closeFixtureDb,
  fixtureDb,
  prepareOwnedPlans,
  removeOwnedPlans,
  schema,
} from "./db-fixture.ts";
import { signInForFeature } from "./feature-session";

/**
 * Fluxos do B9 pela interface real.
 *
 * A camada de dados tem a prova de isolamento, das pré-condições e dos
 * invariantes. Aqui ficam as coisas que só um navegador mede: a confirmação em
 * modal, o `radiogroup` de estrelas navegando por teclado, o agrupamento por
 * mês na tela, a paginação por URL e a geometria em mobile.
 */
const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (candidate) =>
      candidate.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const AUTHOR = "seed_profile_alex";

/** O plano que atravessa: planejado, com data de ontem. */
const TRAVESSIA = crypto.randomUUID();
/** Já realizado, para avaliar e medir. */
const REALIZADO = crypto.randomUUID();
/** Realizado com data no futuro é impossível pelo produto — este fica planejado. */
const FUTURO = crypto.randomUUID();
const PLANS = [TRAVESSIA, REALIZADO, FUTURO] as const;

async function signIn(page: Page): Promise<void> {
  await signInForFeature(page, account);
}

/**
 * Meia-noite de um dia civil de São Paulo, como instante UTC.
 *
 * Pelo `lib/datetime.ts` e não por `Intl` aqui dentro: a zona do ESLint barra
 * a segunda coisa, e com razão — montar a data do fixture com um fuso implícito
 * faria o teste passar nesta máquina e recusar o date de hoje na Vercel.
 */
function diaEmSaoPaulo(offsetEmDias: number): Date {
  return startOfDayInApp(addCivilDays(civilDateOf(new Date()), offsetEmDias));
}

async function resetPlans(): Promise<void> {
  const db = fixtureDb();

  await db
    .delete(schema.activityEvents)
    .where(inArray(schema.activityEvents.subjectId, [...PLANS]));
  await db
    .delete(schema.memoryRatings)
    .where(inArray(schema.memoryRatings.planId, [...PLANS]));
  await db
    .delete(schema.planDateOptions)
    .where(inArray(schema.planDateOptions.planId, [...PLANS]));

  await db
    .update(schema.plans)
    .set({ status: "planned", archivedAt: null, requiresBooking: false })
    .where(inArray(schema.plans.id, [...PLANS]));

  await db.insert(schema.planDateOptions).values([
    {
      workspaceId: WORKSPACE,
      planId: TRAVESSIA,
      startsAt: diaEmSaoPaulo(-1),
      isConfirmed: true,
      createdBy: AUTHOR,
    },
    {
      workspaceId: WORKSPACE,
      planId: REALIZADO,
      startsAt: diaEmSaoPaulo(-9),
      isConfirmed: true,
      createdBy: AUTHOR,
    },
    {
      workspaceId: WORKSPACE,
      planId: FUTURO,
      startsAt: diaEmSaoPaulo(9),
      isConfirmed: true,
      createdBy: AUTHOR,
    },
  ]);

  await db
    .update(schema.plans)
    .set({ status: "completed" })
    .where(eq(schema.plans.id, REALIZADO));
}

test.beforeAll(async () => {
  await prepareOwnedPlans(PLANS);
  const db = fixtureDb();

  await db
    .update(schema.plans)
    .set({ title: "Date que já aconteceu", city: "São Paulo" })
    .where(eq(schema.plans.id, TRAVESSIA));
  await db
    .update(schema.plans)
    .set({ title: "Memória para avaliar", city: "Santos" })
    .where(eq(schema.plans.id, REALIZADO));
  await db
    .update(schema.plans)
    .set({ title: "Ainda vai acontecer", city: "Campinas" })
    .where(eq(schema.plans.id, FUTURO));
});

test.beforeEach(async () => {
  await resetPlans();
});

test.afterAll(async () => {
  await removeOwnedPlans(PLANS);
  await closeFixtureDb();
});

test("a travessia passa por modal e é irreversível", async ({ page }) => {
  await signIn(page);
  await page.goto(`/planos/${TRAVESSIA}`);

  const abrir = page.getByRole("button", { name: "Marcar como realizado" });
  await expect(abrir).toBeVisible();

  // Abre e desiste: nada muda.
  await abrir.click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("Não dá para voltar atrás");
  await modal.getByRole("button", { name: "Ainda não" }).click();
  await expect(modal).toBeHidden();
  await expect(abrir).toBeVisible();

  // Confirma.
  await abrir.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sim, aconteceu" })
    .click();

  await expect(page.getByText("Realizado é definitivo.")).toBeVisible({
    timeout: 30_000,
  });

  /* Terminal: nenhum botão de status sobra, nem o de concluir de novo. E as
     seções de depois passam a existir. */
  await expect(
    page.getByRole("button", { name: "Marcar como realizado" }),
  ).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Como foi?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "As fotos de vocês" }),
  ).toBeVisible();

  // E ele passou a existir em /memorias.
  await page.goto("/memorias");
  await expect(page.locator(`[data-memory-card="${TRAVESSIA}"]`)).toBeVisible();
});

test("a interface não oferece a travessia de um date que ainda não aconteceu", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/planos/${FUTURO}`);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Marcar como realizado" }),
  ).toBeHidden();

  // E ele não está na timeline.
  await page.goto("/memorias");
  await expect(page.locator(`[data-memory-card="${FUTURO}"]`)).toBeHidden();
});

test("avaliar: uma pessoa não faz média, e a ausência aparece como ausência", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/planos/${REALIZADO}`);

  await expect(page.getByRole("heading", { name: "Como foi?" })).toBeVisible();

  // Antes de qualquer nota, ninguém avaliou — e não há zero em lugar nenhum.
  await expect(page.getByText(/ainda não avaliou/)).toHaveCount(2);
  await expect(page.locator("[data-rating-average]")).toHaveCount(0);

  /* `force` porque o radio é `sr-only`: o clique real chega nele pelo
     `<label>` que o envolve (encaminhamento nativo do browser), mas o
     hit-test do Playwright vê o label, não o input, no ponto do clique. */
  await page.getByRole("radio", { name: "4 de 5" }).check({ force: true });

  // Uma pessoa: ainda sem média, e a outra continua explicitamente ausente.
  await expect(page.getByText(/ainda não avaliou/)).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(page.locator("[data-rating-average]")).toHaveCount(0);

  // "Repetiria?" e os textos só aparecem depois da nota.
  await page.getByRole("button", { name: "Talvez", exact: true }).click();
  await expect(page.getByText("Talvez repetisse")).toBeVisible({
    timeout: 30_000,
  });

  await page.getByLabel("Melhor parte").fill("O caminho de volta a pé");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("O caminho de volta a pé")).toBeVisible({
    timeout: 30_000,
  });

  // Reenviar a mesma nota retira a avaliação inteira.
  await page.getByRole("radio", { name: "4 de 5" }).click({ force: true });
  await expect(page.getByText(/ainda não avaliou/)).toHaveCount(2, {
    timeout: 30_000,
  });
});

test("a nota é um radiogroup navegável por teclado, com nome por opção", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/planos/${REALIZADO}`);

  const estrelas = page.getByRole("radio");
  await expect(estrelas).toHaveCount(5);

  for (const nota of [1, 2, 3, 4, 5]) {
    await expect(
      page.getByRole("radio", { name: `${nota} de 5` }),
    ).toHaveCount(1);
  }

  // Seta move dentro do grupo, que é o comportamento nativo dos radios.
  await page.getByRole("radio", { name: "2 de 5" }).focus();
  await page.keyboard.press("ArrowRight");

  await expect(page.getByRole("radio", { name: "3 de 5" })).toBeChecked({
    timeout: 30_000,
  });
});

test("a timeline agrupa por mês civil e pagina pela URL", async ({ page }) => {
  const db = fixtureDb();

  /* 23:30 do último dia de um mês, em São Paulo. Em UTC isso já é o dia 1º do
     mês seguinte — é o caso que faria o card cair no cabeçalho errado. */
  const virada = new Date("2026-08-01T02:30:00Z");
  await db
    .update(schema.planDateOptions)
    .set({ startsAt: virada })
    .where(eq(schema.planDateOptions.planId, REALIZADO));

  await signIn(page);
  await page.goto("/memorias");

  const card = page.locator(`[data-memory-card="${REALIZADO}"]`);
  await expect(card).toBeVisible();

  // O card está dentro do grupo de julho, não do de agosto.
  await expect(
    page.locator('[data-month-group="2026-07"]').locator(card),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-month-group="2026-08"]').locator(card),
  ).toHaveCount(0);

  await expect(
    page.getByRole("heading", { name: "Julho de 2026" }),
  ).toBeVisible();
});

test("parâmetro de página inválido não produz erro nem tela quebrada", async ({
  page,
}) => {
  await signIn(page);

  for (const consulta of [
    "?pagina=0",
    "?pagina=-1",
    "?pagina=abc",
    "?pagina=999999",
    "?pagina=",
  ]) {
    const resposta = await page.goto(`/memorias${consulta}`);

    expect(resposta?.status(), `status de /memorias${consulta}`).toBeLessThan(
      400,
    );
    await expect(
      page.getByRole("heading", { level: 1, name: "Memórias" }),
    ).toBeVisible();
  }
});

for (const width of [320, 390, 1280] as const) {
  test(`medidas das memórias em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await signIn(page);

    for (const rota of ["/memorias", `/planos/${REALIZADO}`]) {
      await page.goto(rota);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");

      const measurements = await page.evaluate(() => {
        const tooSmall: string[] = [];
        const tinyText: string[] = [];

        for (const element of document.querySelectorAll<HTMLElement>(
          "button, a, input, textarea, [role='button'], [role='combobox']",
        )) {
          const box = element.getBoundingClientRect();
          if (box.width <= 1 && box.height <= 1) continue;

          /* O alvo de um radio é o `label` que o embrulha, nunca o input de
             1px na `sr-only` — a medição do B5 já tropeçou nisso. */
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

        const root = document.documentElement;
        return {
          tooSmall,
          tinyText,
          horizontalScroll: root.scrollWidth > root.clientWidth,
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
        };
      });

      expect(measurements.tooSmall, `${rota}: alvos abaixo de 44px`).toEqual(
        [],
      );
      expect(measurements.tinyText, `${rota}: texto abaixo de 12px`).toEqual(
        [],
      );
      expect(
        measurements.horizontalScroll,
        `${rota}: scroll horizontal ${measurements.scrollWidth} > ${measurements.clientWidth}`,
      ).toBe(false);
    }

    // Foco visível na primeira parada de tabulação.
    await page.goto(`/planos/${REALIZADO}`);
    await page.keyboard.press("Tab");
    const foco = await page.evaluate(() => {
      const alvo = document.activeElement as HTMLElement | null;
      if (!alvo || alvo === document.body) return null;

      const estilo = getComputedStyle(alvo);
      return {
        outlineWidth: Number.parseFloat(estilo.outlineWidth),
        outlineStyle: estilo.outlineStyle,
      };
    });

    expect(foco, "nada recebeu foco no primeiro Tab").not.toBeNull();
    expect(foco!.outlineStyle).not.toBe("none");
    expect(foco!.outlineWidth).toBeGreaterThanOrEqual(2);
  });
}
