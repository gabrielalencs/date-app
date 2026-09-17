import { inArray } from "drizzle-orm";
import { expect, test, type Page } from "./harness.ts";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import { signInForFeature } from "./feature-session";
import { closeFixtureDb, fixtureDb, schema } from "./db-fixture.ts";
import {
  civilDateOf,
  dayKey,
  parseDayParam,
  startOfDayInApp,
} from "@/lib/datetime";

/**
 * O calendário pelo navegador.
 *
 * O que só o navegador prova: que a célula mede 44px de verdade, que a grade
 * vazia não come 42 paradas de tabulação, que o nome acessível chega inteiro ao
 * leitor de tela, e que URL hostil devolve o mês corrente em vez de uma tela de
 * erro.
 *
 * Os dados são próprios da execução e removidos ao final (D-082): nenhuma opção
 * do seed é apagada, e o `database.integration.test.ts` continua achando os
 * oito planos que ele afirma existirem.
 */
const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (c) => c.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const AUTOR = "seed_profile_alex";

/** Longe do seed e de "hoje": o mês do teste é escolhido, não herdado. */
const MES = "2027-05";
const MES_VAZIO = "2031-02";

const PLANO_CHEIO = crypto.randomUUID();
const PLANO_NOTURNO = crypto.randomUUID();
const PLANO_DE_HOJE = crypto.randomUUID();
const PLANOS = [PLANO_CHEIO, PLANO_NOTURNO, PLANO_DE_HOJE] as const;

/**
 * O dia civil de hoje, pelo módulo que declara o fuso.
 *
 * Sem isto, a célula de hoje fica vazia e nunca vira link — e o nome acessível
 * de "hoje com conteúdo", que é o caso que o leitor de tela precisa acertar,
 * ficaria sem prova.
 */
const HOJE = civilDateOf(new Date());
const HOJE_KEY = dayKey(new Date());

async function signIn(page: Page): Promise<void> {
  await signInForFeature(page, account);
}

/**
 * Espera a grade existir antes de medir.
 *
 * Medir logo depois do `goto` devolvia `boundingBox()` nulo assim que a
 * resposta passava a ser transmitida em pedaços. `/agenda` acabou ficando sem
 * `loading.tsx` — a grade sem JavaScript é contrato do B7 e transmissão o
 * quebra —, mas a espera fica: medir sem antes garantir que o alvo existe é
 * fragilidade em qualquer cenário.
 */
async function esperarGrade(page: Page): Promise<void> {
  await page.locator("table.calendar-table").first().waitFor({ state: "visible" });
}

/**
 * `yyyy-MM-dd` + hora de parede em São Paulo → instante.
 *
 * Pelo módulo do tempo, não por um `-03:00` escrito à mão: offset fixo é
 * proibido também em fixture (D-059). O Brasil está estável em UTC−3 hoje, mas
 * a regra já mudou várias vezes por lei, e uma fixture com o offset cravado
 * passaria a montar o dado errado calada.
 */
function spInstant(dia: string, hora: number, minuto = 0): Date {
  const civil = parseDayParam(dia);
  if (!civil) throw new Error(`Dia inválido na fixture: ${dia}`);

  return new Date(
    startOfDayInApp(civil).getTime() + (hora * 60 + minuto) * 60_000,
  );
}

test.beforeAll(async () => {
  const db = fixtureDb();

  await db.insert(schema.plans).values([
    {
      id: PLANO_CHEIO,
      workspaceId: WORKSPACE,
      createdBy: AUTOR,
      title: "Semana cheia de teste",
      category: "cultura",
      status: "deciding" as const,
    },
    {
      id: PLANO_NOTURNO,
      workspaceId: WORKSPACE,
      createdBy: AUTOR,
      title: "Jantar da virada",
      category: "gastronomia",
      status: "deciding" as const,
    },
    {
      id: PLANO_DE_HOJE,
      workspaceId: WORKSPACE,
      createdBy: AUTOR,
      title: "Café de hoje",
      category: "gastronomia",
      status: "deciding" as const,
    },
  ]);

  await db.insert(schema.planDateOptions).values([
    // Um dia com duas opções, uma delas confirmada.
    {
      workspaceId: WORKSPACE,
      planId: PLANO_CHEIO,
      startsAt: spInstant("2027-05-12", 20),
      isConfirmed: true,
      createdBy: AUTOR,
    },
    {
      workspaceId: WORKSPACE,
      planId: PLANO_CHEIO,
      startsAt: spInstant("2027-05-12", 22),
      createdBy: AUTOR,
    },
    // Um dia com uma candidata só.
    {
      workspaceId: WORKSPACE,
      planId: PLANO_CHEIO,
      startsAt: spInstant("2027-05-19", 19),
      createdBy: AUTOR,
    },
    /* A armadilha do bloco, agora na tela: 23:30 de 31 de maio é
       2027-06-01T02:30Z. Tem que aparecer em 31/05, não em 01/06. */
    {
      workspaceId: WORKSPACE,
      planId: PLANO_NOTURNO,
      startsAt: spInstant("2027-05-31", 23, 30),
      createdBy: AUTOR,
    },
    // Hoje às 19:00, para a célula de hoje ser um link com nome acessível.
    {
      workspaceId: WORKSPACE,
      planId: PLANO_DE_HOJE,
      startsAt: new Date(startOfDayInApp(HOJE).getTime() + 19 * 3_600_000),
      createdBy: AUTOR,
    },
  ]);
});

test.afterAll(async () => {
  const db = fixtureDb();
  await db
    .delete(schema.activityEvents)
    .where(inArray(schema.activityEvents.subjectId, [...PLANOS]));
  await db.delete(schema.plans).where(inArray(schema.plans.id, [...PLANOS]));
  await closeFixtureDb();
});

test.describe("a grade do mês", () => {
  test("tem 42 células em 6 linhas e a semana começa na segunda", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/agenda?mes=${MES}`);

    await expect(
      page.getByRole("heading", { name: "Maio de 2027" }),
    ).toBeVisible();

    /* textContent, não innerText: o `text-transform: uppercase` é decisão de
       design e innerText devolve "SEG". Afirmar sobre o conteúdo é afirmar
       sobre o contrato; afirmar sobre o render é afirmar sobre o CSS (D-083). */
    const cabecalhos = await page
      .locator("table.calendar-table thead th")
      .allTextContents();
    expect(cabecalhos).toEqual([
      "Seg",
      "Ter",
      "Qua",
      "Qui",
      "Sex",
      "Sáb",
      "Dom",
    ]);

    await expect(page.locator("table.calendar-table tbody tr")).toHaveCount(6);
    await expect(page.locator("[data-day]")).toHaveCount(42);
  });

  test("a altura não muda entre meses (D-076)", async ({ page }) => {
    await signIn(page);

    const alturas: number[] = [];
    for (const mes of ["2027-02", "2027-05", "2027-08"]) {
      await page.goto(`/agenda?mes=${mes}`);
      await esperarGrade(page);
      const caixa = await page.locator("table.calendar-table").boundingBox();
      alturas.push(Math.round(caixa!.height));
    }

    expect(new Set(alturas).size).toBe(1);
  });

  test("a opção das 23:30 de 31/05 fica em 31/05, não em 01/06", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/agenda?mes=${MES}`);

    const trintaEUm = page.locator('[data-day="2027-05-31"]');
    const primeiroDeJunho = page.locator('[data-day="2027-06-01"]');

    await expect(trintaEUm).toHaveAttribute("data-entries", "1");
    await expect(primeiroDeJunho).toHaveAttribute("data-entries", "0");
  });

  test("células de fora do mês aparecem apagadas, com conteúdo real", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/agenda?mes=${MES}`);

    // Junho aparece na grade de maio e é marcado como de fora.
    await expect(page.locator('[data-day="2027-06-01"]')).toHaveAttribute(
      "data-outside",
      "true",
    );
    await expect(page.locator('[data-day="2027-05-12"]')).toHaveAttribute(
      "data-outside",
      "false",
    );
  });

  test("confirmada e candidata se distinguem por forma, não só por cor", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/agenda?mes=${MES}`);

    const dia12 = page.locator('[data-day="2027-05-12"]');
    await expect(
      dia12.locator('.calendar-marker[data-confirmed="true"]'),
    ).toHaveCount(2);

    const preenchimentos = await dia12
      .locator(".calendar-marker")
      .evaluateAll((nodes) =>
        nodes.map((n) => getComputedStyle(n).backgroundColor),
      );

    // A confirmada é preenchida; a candidata é transparente (só contorno).
    expect(preenchimentos.some((c) => c === "rgba(0, 0, 0, 0)")).toBe(true);
    expect(preenchimentos.some((c) => c !== "rgba(0, 0, 0, 0)")).toBe(true);
  });
});

test.describe("navegação (D-078)", () => {
  test("anterior e seguinte são links de verdade", async ({ page }) => {
    await signIn(page);
    await page.goto(`/agenda?mes=${MES}`);

    await page.getByRole("link", { name: /Próximo mês/ }).click();
    await expect(page).toHaveURL(/mes=2027-06/);
    await expect(
      page.getByRole("heading", { name: "Junho de 2027" }),
    ).toBeVisible();

    await page.getByRole("link", { name: /Mês anterior/ }).click();
    await expect(page).toHaveURL(/mes=2027-05/);

    // O histórico se comporta: voltar devolve junho.
    await page.goBack();
    await expect(page).toHaveURL(/mes=2027-06/);
  });

  test("hoje tem aria-current e o link Hoje some no mês corrente", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/agenda?mes=${MES}`);
    await expect(
      page.getByRole("link", { name: "Hoje", exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Hoje", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Hoje", exact: true }),
    ).toHaveCount(0);

    // Exatamente um dia é hoje, e ele carrega aria-current="date".
    await expect(page.locator('td[aria-current="date"]')).toHaveCount(1);
    await expect(page.locator('[data-today="true"]')).toHaveCount(1);
  });

  test("clicar num dia com conteúdo abre o painel e põe o dia na URL", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/agenda?mes=${MES}`);

    await page.locator('[data-day="2027-05-12"]').click();
    await expect(page).toHaveURL(/dia=2027-05-12/);

    const painel = page.getByRole("complementary");
    await expect(
      painel.getByText("Semana cheia de teste").first(),
    ).toBeVisible();
    await expect(painel.locator("[data-option]")).toHaveCount(2);

    // A célula selecionada é marcada.
    await expect(
      page.locator('[data-day="2027-05-12"][data-selected="true"]'),
    ).toHaveCount(1);
  });

  test("o painel leva de volta ao plano", async ({ page }) => {
    await signIn(page);
    await page.goto(`/agenda?mes=${MES}&dia=2027-05-19`);

    await page
      .getByRole("complementary")
      .locator("[data-option]")
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/planos/${PLANO_CHEIO}`));
  });
});

test.describe("filtro por categoria", () => {
  test("filtra por link e o mês continua o mesmo", async ({ page }) => {
    await signIn(page);
    await page.goto(`/agenda?mes=${MES}`);

    // Sem filtro: cultura (3 opções em 2 dias) e gastronomia (1) aparecem.
    await expect(page.locator("table.calendar-table a")).toHaveCount(3);

    await page.locator('[data-category="gastronomia"]').click();
    await expect(page).toHaveURL(/categoria=gastronomia/);
    await expect(page).toHaveURL(/mes=2027-05/);

    // Só o "Jantar da virada", em 31/05.
    await expect(page.locator("table.calendar-table a")).toHaveCount(1);
    await expect(page.locator('[data-day="2027-05-31"]')).toHaveAttribute(
      "data-entries",
      "1",
    );
    await expect(page.locator('[data-day="2027-05-12"]')).toHaveAttribute(
      "data-entries",
      "0",
    );

    // O chip ativo se anuncia, e "Todas" devolve tudo.
    await expect(page.locator('[data-category="gastronomia"]')).toHaveAttribute(
      "aria-current",
      "true",
    );
    await page.locator('[data-category="todas"]').click();
    await expect(page.locator("table.calendar-table a")).toHaveCount(3);
  });

  test("a navegação entre meses preserva o filtro", async ({ page }) => {
    await signIn(page);
    await page.goto(`/agenda?mes=${MES}&categoria=gastronomia`);

    await page.getByRole("link", { name: /Próximo mês/ }).click();
    await expect(page).toHaveURL(/categoria=gastronomia/);
    await expect(page).toHaveURL(/mes=2027-06/);
  });
});

test.describe("URL hostil não derruba a página", () => {
  const HOSTIS = [
    "?mes=2026-13",
    "?mes=abc",
    "?mes=",
    "?mes=2027-05&dia=",
    "?mes=2027-05&dia=2027-09-14",
    "?mes=2027-05&dia=abc",
    "?mes=2026-02-31",
    "?mes[]=2027-05",
    "?categoria=nao-existe",
    "?mes=99999-99&dia=0000-00-00",
    "",
  ];

  for (const query of HOSTIS) {
    test(`/agenda${query || " (sem query)"} responde 200`, async ({ page }) => {
      await signIn(page);
      const resposta = await page.goto(`/agenda${query}`);

      expect(resposta!.status()).toBe(200);
      await expect(page.locator("table.calendar-table")).toBeVisible();
      await expect(page.locator("[data-day]")).toHaveCount(42);
      // Nenhuma tela de erro do Next.
      await expect(page.getByText("Application error")).toHaveCount(0);
    });
  }

  test("mês inválido cai no mês corrente, não numa tela de erro", async ({
    page,
  }) => {
    await signIn(page);

    await page.goto("/agenda?mes=2026-13");
    const comLixo = await page.locator("h2").first().innerText();

    await page.goto("/agenda");
    const semParametro = await page.locator("h2").first().innerText();

    expect(comLixo).toBe(semParametro);
  });
});

test.describe("acessibilidade", () => {
  test("célula vazia não é parada de tabulação", async ({ page }) => {
    await signIn(page);

    await page.goto(`/agenda?mes=${MES}`);
    const naGradeCheia = await page.locator("table.calendar-table a").count();

    await page.goto(`/agenda?mes=${MES_VAZIO}`);
    const naGradeVazia = await page.locator("table.calendar-table a").count();

    // Três dias com conteúdo em maio de 2027; nenhum em fevereiro de 2031.
    expect(naGradeCheia).toBe(3);
    expect(naGradeVazia).toBe(0);

    // E nenhuma célula sem conteúdo ganhou tabindex por engano.
    expect(await page.locator("table.calendar-table [tabindex]").count()).toBe(
      0,
    );
  });

  test("os nomes acessíveis dizem o que a célula tem", async ({ page }) => {
    await signIn(page);
    await page.goto(`/agenda?mes=${MES}`);

    const comConteudo = await page
      .locator('[data-day="2027-05-12"]')
      .getAttribute("aria-label");
    const soUma = await page
      .locator('[data-day="2027-05-19"]')
      .getAttribute("aria-label");
    /* Na célula vazia o nome acessível é o texto sr-only; o número visível vai
       com aria-hidden, senão o leitor ouviria "13 de maio 13". */
    const vazio = await page
      .locator('[data-day="2027-05-13"] .sr-only')
      .innerText();
    const numeroVisivel = await page
      .locator('[data-day="2027-05-13"] .calendar-daynum')
      .getAttribute("aria-hidden");

    await page.goto("/agenda");
    const hoje = await page
      .locator('[data-today="true"]')
      .getAttribute("aria-label");

    console.log("NOME ACESSÍVEL · dia com conteúdo :", comConteudo);
    console.log("NOME ACESSÍVEL · uma candidata    :", soUma);
    console.log("NOME ACESSÍVEL · dia vazio        :", vazio.trim());
    console.log("NOME ACESSÍVEL · hoje             :", hoje);

    expect(comConteudo).toBe("12 de maio, 2 planos, 1 confirmado");
    expect(soUma).toBe("19 de maio, 1 plano");

    // "13" sozinho não diria nada fora do contexto visual (seção 10).
    expect(vazio.trim()).toBe("13 de maio");
    expect(numeroVisivel).toBe("true");

    /* Hoje tem conteúdo pela fixture, então é link e tem nome completo. O
       `aria-current` mora na célula, não no link: é a célula que é hoje. */
    expect(hoje).toMatch(/^\d{1,2} de \S+, 1 plano$/);
    expect(await page.locator('td[aria-current="date"]').count()).toBe(1);
    expect(HOJE_KEY).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("a tabela tem caption e cabeçalhos de coluna com abbr", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/agenda?mes=${MES}`);

    await expect(page.locator("table.calendar-table caption")).toHaveText(
      "Calendário de Maio de 2027",
    );
    await expect(page.locator('thead th[scope="col"]')).toHaveCount(7);
    await expect(
      page.locator('thead th abbr[title="Segunda-feira"]'),
    ).toHaveCount(1);
  });

  test("a grade funciona sem JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    // Sessão pelo cookie já obtido; o login em si tem suíte própria.
    const comJs = await browser.newContext();
    const paginaComJs = await comJs.newPage();
    await signInForFeature(paginaComJs, account);
    await context.addCookies(await comJs.cookies());
    await comJs.close();

    await page.goto(`/agenda?mes=${MES}`);
    await expect(page.locator("[data-day]")).toHaveCount(42);
    await expect(page.locator("table.calendar-table a")).toHaveCount(3);

    await context.close();
  });
});

const LARGURAS = [320, 375, 1280] as const;

for (const largura of LARGURAS) {
  test(`medidas da agenda em ${largura}px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await signIn(page);
    await page.goto(`/agenda?mes=${MES}&dia=2027-05-12`);
    await esperarGrade(page);

    const medidas = await page.evaluate(() => {
      const celulas = [
        ...document.querySelectorAll<HTMLElement>("[data-day]"),
      ].map((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });

      const pequenos: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(
        "a, button, input, select, textarea",
      )) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        /* O link de pular conteúdo é 1x1 até receber foco, quando vira um
           alvo de 44px. Mesma guarda da suíte de datas. */
        if (r.width <= 1 && r.height <= 1) continue;
        if (r.width < 44 || r.height < 44) {
          pequenos.push(
            `${el.tagName.toLowerCase()}[${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 20) ?? ""}] ${Math.round(r.width)}x${Math.round(r.height)}`,
          );
        }
      }

      const miudos: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("*")) {
        if (!el.textContent?.trim() || el.children.length > 0) continue;
        const tamanho = Number.parseFloat(getComputedStyle(el).fontSize);
        if (tamanho > 0 && tamanho < 12) {
          miudos.push(`${el.tagName.toLowerCase()} ${tamanho.toFixed(1)}px`);
        }
      }

      const raiz = document.documentElement;
      return {
        menorCelulaLargura: Math.min(...celulas.map((c) => c.w)),
        menorCelulaAltura: Math.min(...celulas.map((c) => c.h)),
        pequenos,
        miudos,
        scrollHorizontal: raiz.scrollWidth > raiz.clientWidth,
        scrollWidth: raiz.scrollWidth,
        clientWidth: raiz.clientWidth,
      };
    });

    console.log(`MEDIDAS ${largura}px ·`, JSON.stringify(medidas, null, 2));

    expect(medidas.menorCelulaLargura).toBeGreaterThanOrEqual(44);
    expect(medidas.menorCelulaAltura).toBeGreaterThanOrEqual(44);
    expect(medidas.miudos).toEqual([]);
    expect(medidas.pequenos).toEqual([]);
    expect(medidas.scrollHorizontal).toBe(false);
  });
}

test("o foco fica visível ao chegar por Tab", async ({ page }) => {
  await signIn(page);
  await page.goto(`/agenda?mes=${MES}`);
  await esperarGrade(page);

  // Tab de verdade, não .focus(): :focus-visible não casa com foco programático.
  const alvo = page.locator('[data-day="2027-05-12"]');
  await page.keyboard.press("Tab");
  for (let i = 0; i < 40; i += 1) {
    if (await alvo.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }

  expect(await alvo.evaluate((el) => el === document.activeElement)).toBe(true);

  const contorno = await alvo.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outlineWidth: s.outlineWidth, outlineStyle: s.outlineStyle };
  });

  console.log("FOCO VISÍVEL ·", JSON.stringify(contorno));
  expect(contorno.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(contorno.outlineWidth)).toBeGreaterThan(0);
});
