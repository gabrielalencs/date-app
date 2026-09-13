import { eq, inArray } from "drizzle-orm";
import { expect, test, type Page } from "@playwright/test";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import { addCivilDays, civilDateOf, fromCivil } from "@/lib/datetime";
import {
  closeFixtureDb,
  fixtureDb,
  prepareOwnedPlans,
  removeOwnedPlans,
  schema,
} from "./db-fixture.ts";
import { EXIF_MARCADOR, pngComExif } from "./exif-fixture.ts";
import { signInForFeature } from "./feature-session";

/**
 * A timeline e a avaliação em navegador de verdade.
 *
 * O que só aqui se prova: que a virada de mês cai no mês certo na tela, que o
 * `radiogroup` da nota é navegável por teclado com nome acessível por opção,
 * que a interface não oferece a travessia que seria recusada, e que uma foto de
 * memória passa pelo mesmo reprocessamento que descarta EXIF (D-051).
 */
const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (candidate) =>
      candidate.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const AUTHOR = "seed_profile_alex";

/* Um plano por asserção: compartilhar um só faria cada teste herdar o estado do
   anterior, e a avaliação passaria a medir a ordem de execução. */
const VIRADA = crypto.randomUUID();
const MAIO = crypto.randomUUID();
const AVALIAR = crypto.randomUUID();
const FOTO = crypto.randomUUID();
const FUTURO = crypto.randomUUID();
const HOJE_PLANO = crypto.randomUUID();
const PLANOS = [VIRADA, MAIO, AVALIAR, FOTO, FUTURO, HOJE_PLANO] as const;

const HOJE = civilDateOf(new Date());
const AMANHA = addCivilDays(HOJE, 1);
const ONTEM = addCivilDays(HOJE, -1);

/** Hora de parede em São Paulo, sem passar por UTC. */
function asHoras(
  civil: { year: number; month: number; day: number },
  hour: number,
  minute = 0,
): Date {
  return fromCivil({ ...civil, hour, minute });
}

/**
 * 23:30 do último dia de abril de 2026, em São Paulo.
 *
 * Em UTC isso é `2026-05-01T02:30Z`. Agrupado por UTC, este date apareceria em
 * maio — e é exatamente metade dos dates deste produto, que são noturnos.
 */
const VIRADA_DE_MES = asHoras({ year: 2026, month: 4, day: 30 }, 23, 30);

async function signIn(page: Page): Promise<void> {
  await signInForFeature(page, account);
}

test.beforeAll(async () => {
  const db = fixtureDb();
  await prepareOwnedPlans(PLANOS);

  const realizados: [string, string, Date][] = [
    [VIRADA, "Show na virada de abril", VIRADA_DE_MES],
    [MAIO, "Jantar de maio", asHoras({ year: 2026, month: 5, day: 2 }, 20)],
    [AVALIAR, "Date para avaliar", asHoras(ONTEM, 20)],
    [FOTO, "Date com foto de memória", asHoras(ONTEM, 21)],
  ];

  for (const [id, title] of realizados) {
    await db
      .update(schema.plans)
      .set({ title, status: "completed", city: "São Paulo" })
      .where(eq(schema.plans.id, id));
  }

  /* Dois planos que **não** são memória, e existem para provar o que a
     interface não oferece: um com data confirmada no futuro e outro com data
     de hoje. */
  await db
    .update(schema.plans)
    .set({ title: "Date de semana que vem", status: "planned" })
    .where(eq(schema.plans.id, FUTURO));
  await db
    .update(schema.plans)
    .set({ title: "Date de hoje", status: "planned" })
    .where(eq(schema.plans.id, HOJE_PLANO));

  await db.insert(schema.planDateOptions).values([
    ...realizados.map(([id, , startsAt]) => ({
      workspaceId: WORKSPACE,
      planId: id,
      startsAt,
      isConfirmed: true,
      createdBy: AUTHOR,
    })),
    {
      workspaceId: WORKSPACE,
      planId: FUTURO,
      startsAt: asHoras(AMANHA, 20),
      isConfirmed: true,
      createdBy: AUTHOR,
    },
    {
      workspaceId: WORKSPACE,
      planId: HOJE_PLANO,
      startsAt: asHoras(HOJE, 9),
      isConfirmed: true,
      createdBy: AUTHOR,
    },
  ]);
});

test.afterAll(async () => {
  const db = fixtureDb();

  /* As memórias e as avaliações saem por cascata do plano; os eventos não têm
     FK para o sujeito de propósito (append-only), então saem nomeados. */
  await db
    .delete(schema.activityEvents)
    .where(inArray(schema.activityEvents.subjectId, [...PLANOS]));

  await removeOwnedPlans(PLANOS);
  await closeFixtureDb();
});

test("o date das 23:30 do último dia aparece no mês dele, não no seguinte", async ({
  page,
}) => {
  // A prova de que o instante realmente cruza a meia-noite UTC.
  expect(VIRADA_DE_MES.toISOString()).toBe("2026-05-01T02:30:00.000Z");

  await signIn(page);
  await page.goto("/memorias");

  const abril = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Abril de 2026" }) });
  const maio = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Maio de 2026" }) });

  await expect(
    abril.getByRole("heading", { name: "Show na virada de abril" }),
  ).toBeVisible();
  await expect(
    maio.getByRole("heading", { name: "Show na virada de abril" }),
  ).toHaveCount(0);

  // E maio tem o seu, para o teste não passar por um agrupamento vazio.
  await expect(
    maio.getByRole("heading", { name: "Jantar de maio" }),
  ).toBeVisible();
});

test("os meses vêm do mais recente para o mais antigo", async ({ page }) => {
  await signIn(page);
  await page.goto("/memorias");

  const titulos = await page
    .getByRole("heading", { level: 2 })
    .allTextContents();
  const abril = titulos.indexOf("Abril de 2026");
  const maio = titulos.indexOf("Maio de 2026");

  expect(maio).toBeGreaterThanOrEqual(0);
  expect(abril).toBeGreaterThan(maio);
});

const URLS_HOSTIS = [
  "?pagina=0",
  "?pagina=-1",
  "?pagina=abc",
  "?pagina=",
  "?pagina=2.5",
  "?pagina=1e3",
  "?pagina=9999999",
  "?pagina=99999999999999",
  "?pagina=1&pagina=2",
  "?pagina[]=1",
];

for (const query of URLS_HOSTIS) {
  test(`/memorias${query} responde sem erro`, async ({ page }) => {
    await signIn(page);
    const resposta = await page.goto(`/memorias${query}`);

    expect(resposta?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Memórias",
    );
    // Nenhuma tela de erro do Next, em nenhuma delas.
    await expect(page.getByText("Application error")).toHaveCount(0);
  });
}

test("página além do fim oferece a volta ao começo, sem erro", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/memorias?pagina=9999999");

  await expect(
    page.getByRole("link", { name: "Voltar ao começo" }),
  ).toBeVisible();
});

test("a nota é um radiogroup com nome acessível por opção", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/planos/${AVALIAR}`);

  const grupo = page.getByRole("radiogroup", { name: "Sua nota" });
  await expect(grupo).toBeVisible();

  const opcoes = grupo.getByRole("radio");
  await expect(opcoes).toHaveCount(5);

  for (const valor of [1, 2, 3, 4, 5]) {
    await expect(
      grupo.getByRole("radio", { name: `${valor} de 5` }),
    ).toHaveCount(1);
  }
});

test("as setas do teclado andam dentro do grupo", async ({ page }) => {
  await signIn(page);
  await page.goto(`/planos/${AVALIAR}`);

  const grupo = page.getByRole("radiogroup", { name: "Sua nota" });
  await grupo.getByRole("radio", { name: "1 de 5" }).focus();

  await page.keyboard.press("ArrowRight");
  await expect(grupo.getByRole("radio", { name: "2 de 5" })).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(grupo.getByRole("radio", { name: "3 de 5" })).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await expect(grupo.getByRole("radio", { name: "2 de 5" })).toBeFocused();
});

test("avaliar, e reenviar a mesma nota para retirar", async ({ page }) => {
  await signIn(page);
  await page.goto(`/planos/${AVALIAR}`);

  const grupo = page.getByRole("radiogroup", { name: "Sua nota" });
  const quatro = grupo.getByRole("radio", { name: "4 de 5" });

  await quatro.click();
  await expect(quatro).toHaveAttribute("aria-checked", "true", {
    timeout: 30_000,
  });

  // "Repetiria?" só aparece depois da nota: o banco não aceita uma sem a outra.
  const repetiria = page.getByRole("button", { name: "Com certeza" });
  await expect(repetiria).toBeVisible();
  await repetiria.click();
  await expect(repetiria).toHaveAttribute("aria-pressed", "true", {
    timeout: 30_000,
  });

  // Reenviar a mesma nota retira, e leva o "repetiria" junto.
  await quatro.click();
  await expect(quatro).toHaveAttribute("aria-checked", "false", {
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Com certeza" })).toHaveCount(
    0,
  );
});

test("a outra pessoa aparece como não tendo avaliado, nunca como zero", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/planos/${AVALIAR}`);

  await expect(page.getByText(/ainda não avaliou\.$/)).toBeVisible();
  // Ausência é frase, não a nota mais baixa.
  await expect(page.getByText("0 de 5")).toHaveCount(0);
});

test("a interface não oferece a travessia que seria recusada", async ({
  page,
}) => {
  await signIn(page);

  // Data confirmada no futuro: o botão não existe.
  await page.goto(`/planos/${FUTURO}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Marcar como realizado" }),
  ).toHaveCount(0);

  // Data confirmada de hoje: existe, e abre o modal que diz que não tem volta.
  await page.goto(`/planos/${HOJE_PLANO}`);
  await page.getByRole("button", { name: "Marcar como realizado" }).click();

  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("não tem volta");
  await expect(modal.getByRole("button", { name: "Ainda não" })).toBeVisible();
});

test("realizado é terminal: a interface não oferece saída nenhuma", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/planos/${AVALIAR}`);

  await expect(page.getByText("Realizado é definitivo.")).toBeVisible();

  for (const rotulo of [
    "Ideia",
    "Decidindo",
    "Planejado",
    "Reservado",
    "Cancelado",
  ]) {
    await expect(
      page.getByRole("button", { name: rotulo, exact: true }),
    ).toHaveCount(0);
  }
});

test("a foto de memória passa pelo mesmo reprocessamento e não carrega EXIF", async ({
  page,
}) => {
  const comExif = await pngComExif("public/brand/icons/icon-512.png");
  expect(comExif.includes(EXIF_MARCADOR)).toBe(true);

  await signIn(page);
  await page.goto(`/planos/${FOTO}`);

  const secao = page.getByRole("region", { name: "Fotos do date" });
  await expect(secao).toBeVisible();

  const antes = await page.locator('img[src^="/api/media/"]').count();
  await secao.locator('input[type="file"]').setInputFiles({
    name: "foto-com-exif.png",
    mimeType: "image/png",
    buffer: comExif,
  });

  const imagens = page.locator('img[src^="/api/media/"]');
  await expect(imagens).toHaveCount(antes + 1, { timeout: 60_000 });

  const src = await imagens.first().getAttribute("src");
  const mediaId = /\/api\/media\/([0-9a-f-]{36})/.exec(src ?? "")?.[1];
  expect(mediaId).toBeTruthy();

  for (const variante of ["", "?v=thumb"]) {
    const resposta = await page.request.get(`/api/media/${mediaId}${variante}`);
    expect(resposta.status()).toBe(200);

    const corpo = await resposta.body();
    expect(corpo.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(corpo.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(corpo.includes(EXIF_MARCADOR)).toBe(false);
    expect(corpo.includes(Buffer.from("eXIf", "ascii"))).toBe(false);
    expect(corpo.includes(Buffer.from("Exif", "ascii"))).toBe(false);
  }

  // E a foto entrou como memória, não como galeria do plano.
  const db = fixtureDb();
  const linhas = await db
    .select({ purpose: schema.media.purpose })
    .from(schema.media)
    .where(eq(schema.media.planId, FOTO));

  expect(linhas.map((linha) => linha.purpose)).toEqual(["memory"]);
});

for (const width of [320, 390, 1280] as const) {
  test(`medidas das memórias em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await signIn(page);

    for (const caminho of ["/memorias", `/planos/${AVALIAR}`]) {
      await page.goto(caminho);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const medidas = await page.evaluate(() => {
        const tooSmall: string[] = [];
        const tinyText: string[] = [];

        for (const element of document.querySelectorAll<HTMLElement>(
          "button, a, input, textarea, [role='button'], [role='radio'], [role='combobox']",
        )) {
          const box = element.getBoundingClientRect();
          /* O "Pular para o conteúdo" é sr-only de 1×1 por definição, e não é
             alvo de toque de ninguém enquanto não recebe foco. */
          if (box.width <= 1 && box.height <= 1) continue;

          /* Caixa e radio nativos desenham 20px e o alvo é o `<label>` inteiro
             — medir o quadradinho reprovaria um alvo que na prática tem a
             linha toda. Mesmo instrumento do B8. */
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

        const root = document.documentElement;
        return {
          tooSmall,
          tinyText,
          horizontalScroll: root.scrollWidth > root.clientWidth,
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
        };
      });

      expect(medidas.tooSmall, `alvos abaixo de 44px em ${caminho}`).toEqual(
        [],
      );
      expect(medidas.tinyText, `texto abaixo de 12px em ${caminho}`).toEqual(
        [],
      );
      expect(
        medidas.horizontalScroll,
        `scroll horizontal em ${caminho}: ${medidas.scrollWidth} > ${medidas.clientWidth}`,
      ).toBe(false);
    }
  });
}

test("o foco é visível ao chegar por Tab", async ({ page }) => {
  await signIn(page);
  await page.goto(`/planos/${AVALIAR}`);

  await page.keyboard.press("Tab");

  const foco = await page.evaluate(() => {
    const alvo = document.activeElement as HTMLElement | null;
    if (!alvo || alvo === document.body) return null;

    const estilo = getComputedStyle(alvo);
    return {
      outlineWidth: estilo.outlineWidth,
      outlineStyle: estilo.outlineStyle,
    };
  });

  expect(foco).not.toBeNull();
  expect(foco?.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(foco?.outlineWidth ?? "0")).toBeGreaterThanOrEqual(
    2,
  );
});

test("o estado vazio diz o que produz memória, sem emoji e sem promessa", async ({
  page,
}) => {
  const db = fixtureDb();

  /* Esconde tudo que é memória neste workspace e devolve depois (D-082). O
     estado vazio é o primeiro que duas pessoas veem, e é o que a seção 9 do
     documento mais cobra. */
  const realizados = await db
    .select({ id: schema.plans.id, archivedAt: schema.plans.archivedAt })
    .from(schema.plans)
    .where(eq(schema.plans.workspaceId, WORKSPACE));

  const paraEsconder = realizados
    .filter((plano) => plano.archivedAt === null)
    .map((plano) => plano.id);

  await db
    .update(schema.plans)
    .set({ archivedAt: new Date() })
    .where(inArray(schema.plans.id, paraEsconder));

  try {
    await signIn(page);
    await page.goto("/memorias");

    const texto = await page.locator("main").innerText();

    expect(texto).toContain("marcado como realizado");
    expect(texto).not.toContain("!");
    expect(/\p{Extended_Pictographic}/u.test(texto)).toBe(false);
    await expect(
      page.getByRole("link", { name: "Ver nossos planos" }),
    ).toBeVisible();
  } finally {
    await db
      .update(schema.plans)
      .set({ archivedAt: null })
      .where(inArray(schema.plans.id, paraEsconder));
  }
});
