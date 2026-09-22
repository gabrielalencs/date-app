import { eq } from "drizzle-orm";
import { expect, test, type Page } from "./harness.ts";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import { signInForFeature } from "./feature-session";
import {
  prepareOwnedPlans,
  removeOwnedPlans,
  closeFixtureDb,
  fixtureDb,
  schema,
  snapshotPlanos,
  type SnapshotDePlanos,
} from "./db-fixture.ts";

/**
 * O ciclo de datas pela interface real, e as medidas do item 13.
 *
 * O que só o navegador prova: que `<input type="date">` devolve `yyyy-MM-dd`,
 * que a Server Action converte isso para o instante certo no fuso do app, e que
 * o dia que volta na tela é o mesmo que a pessoa escolheu — que é exatamente
 * onde o defeito de fuso apareceria.
 */
const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (c) => c.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

const PLANO = crypto.randomUUID();
const PLANO_MEDIDAS = crypto.randomUUID();
const PLANOS = [PLANO, PLANO_MEDIDAS] as const;

async function signIn(page: Page): Promise<void> {
  await signInForFeature(page, account);
}

let snapshot: SnapshotDePlanos;

/** Restaura as fixtures próprias entre os casos. */
async function limpar(): Promise<void> {
  await snapshot.restaurar();
}

/** Sugere uma data pelo formulário da tela. */
async function sugerir(page: Page, dia: string, hora?: string): Promise<void> {
  await page.getByRole("button", { name: "Sugerir data" }).click();
  await page.locator('input[name="date"]').fill(dia);

  if (hora) {
    await page.locator('input[name="time"]').fill(hora);
  }

  await page.getByRole("button", { name: "Salvar data" }).click();

  // Fechar o formulário é o sinal de que salvou; erro deixa ele aberto.
  await expect(page.getByRole("button", { name: "Sugerir data" })).toBeVisible({
    timeout: 30_000,
  });
}

test.beforeAll(async () => {
  await prepareOwnedPlans(PLANOS);
  snapshot = await snapshotPlanos(PLANOS);
  await limpar();
});

test.afterAll(async () => {
  await limpar();
  await removeOwnedPlans(PLANOS);
  await closeFixtureDb();
});

test("o dia escolhido no formulário é o dia que volta na tela", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/planos/${PLANO}`);

  /* 14 de junho de 2027 é uma segunda-feira. Se a conversão perdesse o fuso,
     o dia voltaria como 13 (domingo) — é o defeito que o documento descreve. */
  await sugerir(page, "2027-06-14", "20:30");

  await expect(
    page.getByText("Segunda-feira, 14 de junho de 2027", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("20:30", { exact: true })).toBeVisible();

  // E o banco guardou o instante certo: 20:30 em São Paulo é 23:30 UTC.
  const [linha] = await fixtureDb()
    .select({ startsAt: schema.planDateOptions.startsAt })
    .from(schema.planDateOptions)
    .where(eq(schema.planDateOptions.planId, PLANO));

  expect(linha!.startsAt.toISOString()).toBe("2027-06-14T23:30:00.000Z");
});

test("dia inteiro guarda a meia-noite do dia em São Paulo", async ({
  page,
}) => {
  await limpar();
  await signIn(page);
  await page.goto(`/planos/${PLANO}`);

  await page.getByRole("button", { name: "Sugerir data" }).click();
  await page.locator('input[name="date"]').fill("2027-06-14");
  await page.locator('input[name="allDay"]').check();
  await page.getByRole("button", { name: "Salvar data" }).click();

  /* O sinal de sucesso é o formulário fechar. Esperar pelo texto "Dia inteiro"
     seria trivialmente verdadeiro: o rótulo do próprio formulário tem esse
     texto enquanto ele está aberto. */
  await expect(page.getByRole("button", { name: "Sugerir data" })).toBeVisible({
    timeout: 30_000,
  });

  const [linha] = await fixtureDb()
    .select({
      startsAt: schema.planDateOptions.startsAt,
      allDay: schema.planDateOptions.allDay,
    })
    .from(schema.planDateOptions)
    .where(eq(schema.planDateOptions.planId, PLANO));

  expect(linha!.allDay).toBe(true);
  expect(linha!.startsAt.toISOString()).toBe("2027-06-14T03:00:00.000Z");
});

test("um rolê de vários dias é uma data só, e ocupa todos os dias na agenda", async ({
  page,
}) => {
  await limpar();
  await signIn(page);
  await page.goto(`/planos/${PLANO}`);

  /* 8 a 10 de outubro de 2027: sexta, sábado e domingo. Uma viagem de fim de
     semana é **uma** proposta para votar, não três linhas concorrendo. */
  await page.getByRole("button", { name: "Sugerir data" }).click();
  await page.locator('input[name="date"]').fill("2027-10-08");
  await page.locator('input[name="allDay"]').check();
  await page.locator('input[name="spansDays"]').check();
  await page.locator('input[name="endDate"]').fill("2027-10-10");
  await page.getByRole("button", { name: "Salvar data" }).click();

  await expect(page.getByRole("button", { name: "Sugerir data" })).toBeVisible({
    timeout: 30_000,
  });

  // Uma linha, com o intervalo e a contagem de dias.
  await expect(
    page.getByText("Sex, 8 de out. – Dom, 10 de out.", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("3 dias · dia inteiro", { exact: true })).toBeVisible();

  const linhas = await fixtureDb()
    .select({
      startsAt: schema.planDateOptions.startsAt,
      endsAt: schema.planDateOptions.endsAt,
    })
    .from(schema.planDateOptions)
    .where(eq(schema.planDateOptions.planId, PLANO));

  // Uma linha no banco, não três. Meia-noite de São Paulo nas duas pontas.
  expect(linhas).toHaveLength(1);
  expect(linhas[0]!.startsAt.toISOString()).toBe("2027-10-08T03:00:00.000Z");
  expect(linhas[0]!.endsAt?.toISOString()).toBe("2027-10-10T03:00:00.000Z");

  /* A agenda mostra o rolê nos três dias. Mostrar só no primeiro deixaria
     sábado e domingo em branco - e dia em branco é convite para marcar outra
     coisa em cima. */
  await page.goto("/agenda?mes=2027-10");
  for (const dia of ["2027-10-08", "2027-10-09", "2027-10-10"]) {
    await expect(page.locator(`[data-day="${dia}"]`)).toHaveAttribute(
      "data-entries",
      "1",
    );
  }
  await expect(page.locator('[data-day="2027-10-11"]')).toHaveAttribute(
    "data-entries",
    "0",
  );

  // E o painel do dia do meio diz em que ponto do rolê aquele dia está.
  await page.goto("/agenda?mes=2027-10&dia=2027-10-09");
  await expect(page.getByText("Dia 2 de 3", { exact: true })).toBeVisible();
});

test("sugerir, votar e confirmar move o status", async ({ page }) => {
  await limpar();
  await signIn(page);
  await page.goto(`/planos/${PLANO}`);

  const pill = page.locator("[data-status]");
  await expect(pill).toHaveAttribute("data-status", "idea");

  await sugerir(page, "2027-07-03", "19:00");

  // A primeira data tira o plano de "ideia".
  await expect(pill).toHaveAttribute("data-status", "deciding", {
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Sim", exact: true }).first().click();
  await expect(
    page.getByRole("button", { name: "Sim", exact: true }).first(),
  ).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });

  await page.getByRole("button", { name: "Confirmar esta data" }).click();

  await expect(page.getByText("Data confirmada")).toBeVisible({
    timeout: 30_000,
  });
  await expect(pill).toHaveAttribute("data-status", "planned");

  // Desmarcar devolve o plano a decidindo.
  await page.getByRole("button", { name: "Desmarcar" }).click();
  await expect(pill).toHaveAttribute("data-status", "deciding", {
    timeout: 30_000,
  });
});

test("a data confirmada aparece como próximo DATE na Home", async ({
  page,
}) => {
  await limpar();
  await signIn(page);
  await page.goto(`/planos/${PLANO}`);

  await sugerir(page, "2027-09-18", "18:00");
  await page.getByRole("button", { name: "Confirmar esta data" }).click();
  await expect(page.getByText("Data confirmada")).toBeVisible({
    timeout: 30_000,
  });

  await page.goto("/");
  const secao = page.getByText("Próximo DATE");
  await expect(secao).toBeVisible();

  /* A contagem é texto estático do servidor. Não se afirma o número, que muda
     todo dia; afirma-se que é uma contagem em dias e não um relógio. */
  await expect(
    page.getByText(/em \d+ dias|amanhã|hoje/i).first(),
  ).toBeVisible();
});

const LARGURAS = [320, 390, 1280] as const;

for (const largura of LARGURAS) {
  test(`medidas da interface de datas em ${largura}px`, async ({ page }) => {
    await limpar();
    await page.setViewportSize({ width: largura, height: 900 });
    await signIn(page);
    await page.goto(`/planos/${PLANO_MEDIDAS}`);

    // Duas datas e o formulário aberto: tudo que é clicável na tela.
    await sugerir(page, "2027-10-05", "20:00");
    await sugerir(page, "2027-10-06");
    await page.getByRole("button", { name: "Sugerir data" }).click();

    const medidas = await page.evaluate(() => {
      const pequenos: string[] = [];
      const miudos: string[] = [];

      for (const el of document.querySelectorAll<HTMLElement>(
        "button, a, input, select, textarea, [role='button']",
      )) {
        const caixa = el.getBoundingClientRect();
        if (caixa.width <= 1 && caixa.height <= 1) continue;

        const tipo = (el as HTMLInputElement).type;
        const alvo =
          tipo === "checkbox" || tipo === "radio"
            ? (el.closest("label") ?? el)
            : el;

        const r = alvo.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;

        if (r.width < 44 || r.height < 44) {
          pequenos.push(
            `${el.tagName.toLowerCase()}[${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 24) ?? ""}] ${Math.round(r.width)}x${Math.round(r.height)}`,
          );
        }
      }

      for (const el of document.querySelectorAll<HTMLElement>("*")) {
        if (!el.textContent?.trim() || el.children.length > 0) continue;
        const tamanho = Number.parseFloat(getComputedStyle(el).fontSize);
        if (tamanho > 0 && tamanho < 12) {
          miudos.push(`${el.tagName.toLowerCase()} ${tamanho}px`);
        }
      }

      const raiz = document.documentElement;
      return {
        pequenos,
        miudos,
        scrollHorizontal: raiz.scrollWidth > raiz.clientWidth,
        scrollWidth: raiz.scrollWidth,
        clientWidth: raiz.clientWidth,
      };
    });

    expect(medidas.pequenos, "alvos de toque abaixo de 44px").toEqual([]);
    expect(medidas.miudos, "texto abaixo de 12px").toEqual([]);
    expect(
      medidas.scrollHorizontal,
      `scroll horizontal: ${medidas.scrollWidth} > ${medidas.clientWidth}`,
    ).toBe(false);

    /* Foco medido por TECLADO e não por .focus() programático: em Chromium um
       botão só casa com :focus-visible depois de interação de teclado, então
       focar por script mediria a ausência do anel em vez da presença dele. */
    await page.keyboard.press("Tab");

    const anel = await page.evaluate(() => {
      const alvo = document.activeElement as HTMLElement | null;
      if (!alvo || alvo === document.body) return null;
      const s = getComputedStyle(alvo);
      return {
        elemento: alvo.tagName.toLowerCase(),
        outlineStyle: s.outlineStyle,
        outlineWidth: s.outlineWidth,
        boxShadow: s.boxShadow,
      };
    });

    expect(anel, "nada recebeu foco ao pressionar Tab").not.toBeNull();
    expect(
      anel!.outlineStyle !== "none" || anel!.boxShadow !== "none",
      `foco sem indicação visível: ${JSON.stringify(anel)}`,
    ).toBe(true);
  });
}
