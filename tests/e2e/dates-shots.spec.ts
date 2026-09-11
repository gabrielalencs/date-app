import { and, eq } from "drizzle-orm";
import { expect, test, type Page } from "@playwright/test";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import { THEME_STORAGE_KEY, type ResolvedTheme } from "@/lib/theme";
import type { VoteValue } from "@/lib/consensus";
import {
  closeFixtureDb,
  fixtureDb,
  schema,
  snapshotPlanos,
  type SnapshotDePlanos,
} from "./db-fixture.ts";

/**
 * Capturas do B6 e as medidas em navegador.
 *
 * Três estados de `/planos/[id]`: sem nenhuma data, com duas e com cinco. E a
 * Home nos dois estados: com próximo DATE e sem.
 *
 * As datas são inseridas direto no banco, e não pela interface: o que está sob
 * captura é como a tela se comporta com N opções, não o fluxo de criação, que
 * já é testado no `dates.spec.ts`. Inserir direto deixa a captura estável.
 */
const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (c) => c.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const AUTOR = "seed_profile_alex";

const PLANO_SEM_DATA = "22222222-0000-4000-8000-000000000001";
const PLANO_DUAS = "22222222-0000-4000-8000-000000000003";
const PLANO_CINCO = "22222222-0000-4000-8000-000000000004";
const PLANOS = [PLANO_SEM_DATA, PLANO_DUAS, PLANO_CINCO] as const;

const VIEWPORTS = [
  { name: "320", width: 320 },
  { name: "390", width: 390 },
  { name: "1280", width: 1280 },
] as const;

const THEMES: readonly ResolvedTheme[] = ["light", "dark"];

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"]', account.email);
  await page.fill('input[name="password"]', account.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => new URL(url).pathname === "/", {
    timeout: 30_000,
  });
}

/** Datas futuras e estáveis, para a captura não mudar de mês a cada execução. */
function diaDeCaptura(indice: number): Date {
  // 2027-08-DD às 20h em São Paulo = 23h UTC. Sem lib: valor literal.
  return new Date(`2027-08-${String(10 + indice).padStart(2, "0")}T23:00:00Z`);
}

let snapshot: SnapshotDePlanos;

/** Devolve os planos ao estado do seed, em vez de apagar tudo e forçar `idea`. */
async function limpar(): Promise<void> {
  await snapshot.restaurar();
}

test.beforeAll(async () => {
  const db = fixtureDb();
  snapshot = await snapshotPlanos(PLANOS);
  await limpar();

  const linhas: (typeof schema.planDateOptions.$inferInsert)[] = [];

  for (let i = 0; i < 2; i += 1) {
    linhas.push({
      workspaceId: WORKSPACE,
      planId: PLANO_DUAS,
      startsAt: diaDeCaptura(i),
      allDay: i === 1,
      createdBy: AUTOR,
      isConfirmed: i === 0,
    });
  }

  for (let i = 0; i < 5; i += 1) {
    linhas.push({
      workspaceId: WORKSPACE,
      planId: PLANO_CINCO,
      startsAt: diaDeCaptura(i + 5),
      note: i === 2 ? "Sessão das 19h, chegar cedo" : null,
      createdBy: AUTOR,
    });
  }

  const inseridas = await db
    .insert(schema.planDateOptions)
    .values(linhas)
    .returning({
      id: schema.planDateOptions.id,
      planId: schema.planDateOptions.planId,
    });

  /* Votos variados no plano de cinco, para as capturas mostrarem os estados de
     consenso de verdade e não cinco linhas iguais.
     
     Os votos vão para TODOS os membros do workspace, não para dois fixos: a
     branch de development tem quatro memberships (os dois perfis do seed mais
     as duas contas Auth reais do bootstrap), e votar só em dois deixaria toda
     linha em "falta alguém", que foi o que a primeira captura mostrou. */
  const membros = await db
    .select({ profileId: schema.workspaceMembers.profileId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, WORKSPACE));

  const doCinco = inseridas.filter((l) => l.planId === PLANO_CINCO);
  const votos: (typeof schema.planDateVotes.$inferInsert)[] = [];

  /** Um estado de consenso por linha, montado sobre a lista real de membros. */
  const padroes: readonly (readonly (VoteValue | null)[])[] = [
    membros.map(() => "yes"), // both_yes
    membros.map((_, i) => (i === 0 ? "maybe" : "yes")), // leaning
    membros.map(() => "maybe"), // maybe
    membros.map((_, i) => (i === 0 ? null : "yes")), // waiting
    membros.map((_, i) => (i === 0 ? "no" : "yes")), // blocked
  ];

  doCinco.forEach((opcao, indice) => {
    const padrao = padroes[indice] ?? [];

    membros.forEach((membro, posicao) => {
      const voto = padrao[posicao];
      if (voto) {
        votos.push({
          workspaceId: WORKSPACE,
          optionId: opcao.id,
          profileId: membro.profileId,
          vote: voto,
        });
      }
    });
  });

  if (votos.length > 0) {
    await db.insert(schema.planDateVotes).values(votos);
  }

  // O plano de duas tem data confirmada: o status precisa acompanhar.
  await db
    .update(schema.plans)
    .set({ status: "planned" })
    .where(eq(schema.plans.id, PLANO_DUAS));

  await db
    .update(schema.plans)
    .set({ status: "deciding" })
    .where(eq(schema.plans.id, PLANO_CINCO));
});

test.afterAll(async () => {
  await limpar();
  await closeFixtureDb();
});

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`datas ${viewport.name} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: 900 });
      await page.addInitScript(
        ({ key, value }: { key: string; value: string }) => {
          window.localStorage.setItem(key, value);
        },
        { key: THEME_STORAGE_KEY, value: theme },
      );

      await signIn(page);

      for (const [nome, url] of [
        ["home-com-proximo", "/"],
        ["plano-sem-data", `/planos/${PLANO_SEM_DATA}`],
        ["plano-duas-datas", `/planos/${PLANO_DUAS}`],
        ["plano-cinco-datas", `/planos/${PLANO_CINCO}`],
      ] as const) {
        await page.goto(url);
        await page.waitForLoadState("networkidle");

        await page.addStyleTag({
          content: `
            body > div { position: relative !important; }
            nav[aria-label="Navegação principal"] { position: static !important; }
            aside[data-shell="sidebar"] { position: absolute !important; }
          `,
        });

        await page.screenshot({
          path: `screenshots/datas-${nome}-${viewport.name}-${theme}.png`,
          fullPage: true,
        });
      }
    });
  }
}

test("home sem próximo DATE", async ({ page }) => {
  const db = fixtureDb();
  await page.setViewportSize({ width: 390, height: 900 });
  await signIn(page);

  /* O seed do B2 já traz datas confirmadas nos planos 005 e 006 — foi isso que
     a primeira versão deste teste ignorou, e a Home estava certa. Para ver o
     estado sem próximo DATE é preciso desconfirmar tudo e restaurar depois. */
  const confirmadas = await db
    .select({ id: schema.planDateOptions.id })
    .from(schema.planDateOptions)
    .where(
      and(
        eq(schema.planDateOptions.workspaceId, WORKSPACE),
        eq(schema.planDateOptions.isConfirmed, true),
      ),
    );

  try {
    await db
      .update(schema.planDateOptions)
      .set({ isConfirmed: false })
      .where(eq(schema.planDateOptions.workspaceId, WORKSPACE));

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // A seção deixa de existir, em vez de existir vazia.
    await expect(page.getByText("Próximo DATE")).toHaveCount(0);

    await page.screenshot({
      path: "screenshots/datas-home-sem-proximo-390-light.png",
      fullPage: true,
    });
  } finally {
    for (const linha of confirmadas) {
      await db
        .update(schema.planDateOptions)
        .set({ isConfirmed: true })
        .where(eq(schema.planDateOptions.id, linha.id));
    }
  }
});
