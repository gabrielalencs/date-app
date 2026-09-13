import { eq, inArray } from "drizzle-orm";
import { expect, test, type Page } from "@playwright/test";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import { THEME_STORAGE_KEY, type ResolvedTheme } from "@/lib/theme";
import { addCivilDays, civilDateOf, fromCivil } from "@/lib/datetime";
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
 * Os estados de `/memorias` são mutuamente exclusivos — vazio, com poucas, com
 * muitas —, então cada um é montado escondendo os outros e devolvido no fim
 * (D-082). A suíte roda em série (`fullyParallel: false`), o que torna isso
 * seguro.
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
/** Doze memórias espalhadas por três meses, com uma virada de mês dentro. */
const MUITAS = Array.from({ length: 12 }, () => crypto.randomUUID());
const PLANOS = [
  SEM_AVALIACAO,
  UMA_AVALIACAO,
  DUAS_AVALIACOES,
  ...MUITAS,
] as const;

const VIEWPORTS = [
  { name: "320", width: 320 },
  { name: "390", width: 390 },
  { name: "1280", width: 1280 },
] as const;
const THEMES: readonly ResolvedTheme[] = ["light", "dark"];

const HOJE = civilDateOf(new Date());
const ONTEM = addCivilDays(HOJE, -1);

function asHoras(
  civil: { year: number; month: number; day: number },
  hour: number,
  minute = 0,
): Date {
  return fromCivil({ ...civil, hour, minute });
}

/** 23:30 do último dia de abril: em UTC já é maio. */
const VIRADA = asHoras({ year: 2026, month: 4, day: 30 }, 23, 30);

const TITULOS = [
  "Cinema na Augusta",
  "Feira noturna",
  "Trilha na serra",
  "Jantar de aniversário",
  "Show de jazz",
  "Piquenique no parque",
  "Exposição no centro",
  "Café da manhã fora",
  "Sessão dupla em casa",
  "Passeio de bike",
  "Museu à noite",
  "Bar da esquina",
];

/** Datas em três meses, do mais recente para o mais antigo, com a virada. */
const QUANDO = [
  asHoras({ year: 2026, month: 6, day: 20 }, 20),
  asHoras({ year: 2026, month: 6, day: 13 }, 19),
  asHoras({ year: 2026, month: 6, day: 6 }, 9),
  asHoras({ year: 2026, month: 6, day: 2 }, 21),
  asHoras({ year: 2026, month: 5, day: 30 }, 22),
  asHoras({ year: 2026, month: 5, day: 23 }, 20),
  asHoras({ year: 2026, month: 5, day: 16 }, 18),
  asHoras({ year: 2026, month: 5, day: 9 }, 11),
  asHoras({ year: 2026, month: 5, day: 1 }, 20),
  VIRADA,
  asHoras({ year: 2026, month: 4, day: 18 }, 19),
  asHoras({ year: 2026, month: 4, day: 4 }, 15),
];

async function signIn(page: Page): Promise<void> {
  await signInForFeature(page, account);
}

/** Todos os planos do workspace que estavam visíveis antes do teste. */
let visiveisAntes: string[] = [];

/** Esconde tudo e deixa visível só o que a captura precisa. */
async function mostrarApenas(ids: readonly string[]): Promise<void> {
  const db = fixtureDb();

  await db
    .update(schema.plans)
    .set({ archivedAt: new Date() })
    .where(eq(schema.plans.workspaceId, WORKSPACE));

  if (ids.length > 0) {
    await db
      .update(schema.plans)
      .set({ archivedAt: null })
      .where(inArray(schema.plans.id, [...ids]));
  }
}

async function capturar(
  page: Page,
  nome: string,
  viewport: string,
  theme: string,
): Promise<void> {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");

  /* O shell é fixo; sem isto o `fullPage` sai com a navegação repetida sobre o
     conteúdo. Mesmo recorte das capturas do B7 e do B8. */
  await page.addStyleTag({
    content: `
      body > div { position: relative !important; }
      nav[aria-label="Navegação principal"] { position: static !important; }
      aside[data-shell="sidebar"] { position: absolute !important; }
    `,
  });

  await page.screenshot({
    path: `screenshots/memorias-${nome}-${viewport}-${theme}.png`,
    fullPage: true,
  });
}

test.beforeAll(async () => {
  const db = fixtureDb();
  await prepareOwnedPlans(PLANOS);

  const membros = await db
    .select({ profileId: schema.workspaceMembers.profileId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, WORKSPACE));

  if (membros.length < 2) {
    throw new Error("A fixture exige os dois membros do workspace dev.");
  }

  visiveisAntes = (
    await db
      .select({ id: schema.plans.id, archivedAt: schema.plans.archivedAt })
      .from(schema.plans)
      .where(eq(schema.plans.workspaceId, WORKSPACE))
  )
    .filter((plano) => plano.archivedAt === null)
    .map((plano) => plano.id);

  const realizados: [string, string, Date, string][] = [
    [SEM_AVALIACAO, "Noite sem nota ainda", asHoras(ONTEM, 20), "São Paulo"],
    [UMA_AVALIACAO, "Jantar com meia opinião", asHoras(ONTEM, 21), "Santos"],
    [DUAS_AVALIACOES, "O melhor domingo", asHoras(ONTEM, 11), "Ubatuba"],
    ...MUITAS.map(
      (id, i): [string, string, Date, string] => [
        id,
        TITULOS[i]!,
        QUANDO[i]!,
        "São Paulo",
      ],
    ),
  ];

  for (const [id, title, , city] of realizados) {
    await db
      .update(schema.plans)
      .set({
        title,
        status: "completed",
        city,
        category: "cultura",
        requiresBooking: false,
      })
      .where(eq(schema.plans.id, id));
  }

  await db.insert(schema.planDateOptions).values(
    realizados.map(([id, , startsAt]) => ({
      workspaceId: WORKSPACE,
      planId: id,
      startsAt,
      isConfirmed: true,
      createdBy: AUTHOR,
    })),
  );

  // Gastos no plano mais completo: "Como foi?" mostra o total.
  await db.insert(schema.expenses).values([
    {
      workspaceId: WORKSPACE,
      planId: DUAS_AVALIACOES,
      label: "Almoço",
      amountCents: 18_000,
    },
    {
      workspaceId: WORKSPACE,
      planId: DUAS_AVALIACOES,
      label: "Estacionamento",
      amountCents: 3_500,
    },
  ]);

  // Uma avaliação num, as duas no outro — e a memória do casal junto.
  const memorias = await db
    .insert(schema.memories)
    .values([
      { workspaceId: WORKSPACE, planId: UMA_AVALIACAO },
      {
        workspaceId: WORKSPACE,
        planId: DUAS_AVALIACOES,
        highlight: "O caminho de volta pela praia",
        notes: "Chegamos cedo e pegamos a mesa de fora.",
      },
    ])
    .returning({ id: schema.memories.id, planId: schema.memories.planId });

  const porPlano = new Map(memorias.map((linha) => [linha.planId, linha.id]));

  await db.insert(schema.memoryRatings).values([
    {
      workspaceId: WORKSPACE,
      memoryId: porPlano.get(UMA_AVALIACAO)!,
      profileId: membros[0]!.profileId,
      rating: 4,
      wouldRepeat: "yes" as const,
    },
    {
      workspaceId: WORKSPACE,
      memoryId: porPlano.get(DUAS_AVALIACOES)!,
      profileId: membros[0]!.profileId,
      rating: 5,
      wouldRepeat: "yes" as const,
    },
    {
      workspaceId: WORKSPACE,
      memoryId: porPlano.get(DUAS_AVALIACOES)!,
      profileId: membros[1]!.profileId,
      rating: 4,
      wouldRepeat: "maybe" as const,
    },
  ]);
});

test.afterAll(async () => {
  const db = fixtureDb();

  // Devolve o que estava visível antes, e só isso (D-082).
  await db
    .update(schema.plans)
    .set({ archivedAt: new Date() })
    .where(eq(schema.plans.workspaceId, WORKSPACE));
  await db
    .update(schema.plans)
    .set({ archivedAt: null })
    .where(inArray(schema.plans.id, visiveisAntes));

  await db
    .delete(schema.activityEvents)
    .where(inArray(schema.activityEvents.subjectId, [...PLANOS]));

  await removeOwnedPlans(PLANOS);
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

      // Vazio: nada realizado visível.
      await mostrarApenas([]);
      await page.goto("/memorias");
      await capturar(page, "vazio", viewport.name, theme);

      /* Poucas: três memórias num mês só, uma delas com as duas avaliações —
         é o único estado em que o card mostra nota, e precisa aparecer numa
         captura. */
      await mostrarApenas([SEM_AVALIACAO, UMA_AVALIACAO, DUAS_AVALIACOES]);
      await page.goto("/memorias");
      await capturar(page, "poucas", viewport.name, theme);

      // Muitas, com virada de mês: doze em três meses.
      await mostrarApenas(MUITAS);
      await page.goto("/memorias");
      await expect(
        page.getByRole("heading", { name: "Abril de 2026" }),
      ).toBeVisible();
      await capturar(page, "muitas-e-virada", viewport.name, theme);

      // O detalhe, nos três estados da avaliação.
      await mostrarApenas([SEM_AVALIACAO, UMA_AVALIACAO, DUAS_AVALIACOES]);

      for (const [nome, planId] of [
        ["detalhe-sem-avaliacao", SEM_AVALIACAO],
        ["detalhe-uma-avaliacao", UMA_AVALIACAO],
        ["detalhe-duas-avaliacoes", DUAS_AVALIACOES],
      ] as const) {
        await page.goto(`/planos/${planId}`);
        await capturar(page, nome, viewport.name, theme);
      }
    });
  }
}

test("a nota continua legível em escala de cinza", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await signIn(page);
  await mostrarApenas([DUAS_AVALIACOES]);
  await page.goto(`/planos/${DUAS_AVALIACOES}`);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  /* A distinção da nota é por **preenchimento**, não por cor: estrela cheia
     contra estrela contornada. Sem cor nenhuma, as duas continuam diferentes —
     a mesma exigência do marcador do calendário do B7. */
  const formas = await page.evaluate(() => {
    const estrelas = Array.from(
      document.querySelectorAll<SVGElement>(
        "[role='radiogroup'] svg, [role='img'] svg",
      ),
    );

    return estrelas.map((estrela) => estrela.getAttribute("fill"));
  });

  expect(formas.length).toBeGreaterThan(0);
  expect(formas.filter((fill) => fill === "currentColor").length).toBeGreaterThan(
    0,
  );
  expect(formas.filter((fill) => fill === "none").length).toBeGreaterThan(0);

  await page.addStyleTag({
    content: "html { filter: grayscale(1) !important; }",
  });
  await page.screenshot({
    path: "screenshots/memorias-escala-de-cinza-390.png",
    fullPage: true,
  });
});
