import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema/index.ts";
import { listMonthEntries } from "@/features/calendar/data/queries";
import { buildMonthCells, monthWindow } from "@/features/calendar/grid";
import {
  confirmDateOption,
  createDateOption,
} from "@/features/dates/data/mutations";

import { changePlanStatus, createPlan } from "@/features/plans/data/mutations";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import {
  addCivilDays,
  monthGrid,
  startOfDayInApp,
  type CivilMonth,
} from "@/lib/datetime";

/**
 * O calendário contra o banco: isolamento entre workspaces, as duas bordas da
 * janela, o dia civil da célula e a contagem de consultas.
 *
 * Tudo acontece no workspace B, criado e removido aqui. Nenhum plano é criado
 * no workspace A: o `database.integration.test.ts` afirma que ele tem
 * exatamente os oito ids do seed (D-082 — a fixture devolve o que estava).
 */
const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_B = "77777777-7777-4777-8777-777777777777";
const PROFILE_A = "seed_profile_alex";
const PROFILE_B = "seed_profile_calendar_b";

/** Longe do seed e de qualquer "hoje": o mês é escolhido, não herdado. */
const MES: CivilMonth = { year: 2027, month: 4 };

type DatabaseModule = typeof import("@/db/client.ts");
let databaseModule: DatabaseModule | undefined;
let database: DatabaseModule["db"];

const ctxA: AuthorizedContext = {
  userId: PROFILE_A,
  profileId: PROFILE_A,
  workspaceId: WORKSPACE_A,
  role: "owner",
};

const ctxB: AuthorizedContext = {
  userId: PROFILE_B,
  profileId: PROFILE_B,
  workspaceId: WORKSPACE_B,
  role: "owner",
};

/** Um instante de hora de parede em São Paulo, sem passar por UTC. */
function asHoras(
  civil: { year: number; month: number; day: number },
  hora: number,
  minuto = 0,
): Date {
  return new Date(
    startOfDayInApp(civil).getTime() + (hora * 60 + minuto) * 60_000,
  );
}

async function novoPlano(titulo: string): Promise<string> {
  const plano = await createPlan(ctxB, { title: titulo, category: "outro" });
  return plano.id;
}

beforeAll(async () => {
  if (process.env.NEON_BRANCH !== "development") {
    throw new Error("ABORTADO: test:db exige NEON_BRANCH=development.");
  }

  databaseModule = await import("@/db/client.ts");
  database = databaseModule.db;

  await database
    .insert(schema.workspaces)
    .values({ id: WORKSPACE_B, name: "Workspace de calendário B" })
    .onConflictDoNothing();

  await database
    .insert(schema.profiles)
    .values({ id: PROFILE_B, displayName: "Dani" })
    .onConflictDoNothing();

  await database
    .insert(schema.workspaceMembers)
    .values({ workspaceId: WORKSPACE_B, profileId: PROFILE_B, role: "owner" })
    .onConflictDoNothing();
});

afterAll(async () => {
  await database
    .delete(schema.workspaces)
    .where(eq(schema.workspaces.id, WORKSPACE_B));
  await database
    .delete(schema.profiles)
    .where(eq(schema.profiles.id, PROFILE_B));
  await databaseModule?.closeDatabasePool();
});

describe("o calendário não atravessa o workspace", () => {
  let planoDeB = "";

  beforeAll(async () => {
    planoDeB = await novoPlano("Plano de calendário do B");
    await createDateOption(ctxB, planoDeB, {
      startsAt: asHoras({ ...MES, day: 14 }, 20),
    });
  });

  it("o mês do A não traz a opção do B", async () => {
    expect(await listMonthEntries(ctxA, MES)).toHaveLength(0);
  });

  it("o mês do B traz a dele", async () => {
    const entradas = await listMonthEntries(ctxB, MES);

    expect(entradas).toHaveLength(1);
    expect(entradas[0]!.planId).toBe(planoDeB);
  });

  it("nenhum mês do ano inteiro do A vê o plano do B", async () => {
    for (let mes = 1; mes <= 12; mes += 1) {
      const entradas = await listMonthEntries(ctxA, { year: 2027, month: mes });
      expect(entradas.some((e) => e.planId === planoDeB)).toBe(false);
    }
  });
});

describe("o dia civil da célula (D-073)", () => {
  it("uma opção às 23:30 do último dia do mês fica naquela célula", async () => {
    /* O dado que o seed não tem: as datas dele estão em 09:00, 11:00 e 20:00 de
       São Paulo, e nenhuma cruza a meia-noite UTC. 23:30 de 30 de abril é
       2027-05-01T02:30Z — agrupado por UTC cairia em 1º de maio. */
    const plano = await novoPlano("Jantar da virada do mês");
    const ultimoDia = addCivilDays({ ...MES, day: 1 }, 29); // 30 de abril
    const tarde = asHoras(ultimoDia, 23, 30);

    await createDateOption(ctxB, plano, { startsAt: tarde });

    const celulas = buildMonthCells({
      month: MES,
      entries: await listMonthEntries(ctxB, MES),
      now: asHoras({ ...MES, day: 15 }, 12),
    });

    const trinta = celulas.find((c) => c.key === "2027-04-30")!;
    const primeiroDeMaio = celulas.find((c) => c.key === "2027-05-01")!;

    expect(trinta.entries.some((e) => e.planId === plano)).toBe(true);
    expect(primeiroDeMaio.entries.some((e) => e.planId === plano)).toBe(false);

    await database.delete(schema.plans).where(eq(schema.plans.id, plano));
  });
});

describe("as duas bordas da janela (D-075)", () => {
  it("23:30 da última célula entra; 23:30 do dia anterior à primeira não", async () => {
    const grade = monthGrid(MES);
    const primeira = grade[0]!;
    const ultima = grade[41]!;

    const dentro = await novoPlano("Na última célula");
    await createDateOption(ctxB, dentro, {
      startsAt: asHoras(ultima, 23, 30),
    });

    const fora = await novoPlano("Véspera da primeira célula");
    await createDateOption(ctxB, fora, {
      startsAt: asHoras(addCivilDays(primeira, -1), 23, 30),
    });

    const entradas = await listMonthEntries(ctxB, MES);
    const planos = new Set(entradas.map((e) => e.planId));

    expect(planos.has(dentro)).toBe(true);
    expect(planos.has(fora)).toBe(false);

    // A meia-noite do fim é exclusiva: pertence ao mês seguinte.
    const janela = monthWindow(MES);
    const naVirada = await novoPlano("Meia-noite do fim da janela");
    await createDateOption(ctxB, naVirada, { startsAt: janela.end });

    const depois = await listMonthEntries(ctxB, MES);
    expect(depois.some((e) => e.planId === naVirada)).toBe(false);

    for (const id of [dentro, fora, naVirada]) {
      await database.delete(schema.plans).where(eq(schema.plans.id, id));
    }
  });
});

describe("o que aparece e o que não aparece (D-079)", () => {
  it("completed aparece; cancelled e arquivado não", async () => {
    const dia = { ...MES, day: 20 };

    /* O caminho real da máquina de status: a primeira opção move idea →
       deciding e confirmar move deciding → planned, as duas automáticas
       (D-063). Forçar `planned` direto é recusado, e com razão — sem data
       confirmada, `planned` é um estado que mente. */
    const realizado = await novoPlano("Show que já rolou");
    const opcaoDoShow = await createDateOption(ctxB, realizado, {
      startsAt: asHoras(dia, 21),
    });
    await confirmDateOption(ctxB, opcaoDoShow.id);
    await changePlanStatus(ctxB, realizado, "completed");

    const cancelado = await novoPlano("Passeio cancelado");
    await createDateOption(ctxB, cancelado, { startsAt: asHoras(dia, 19) });
    await changePlanStatus(ctxB, cancelado, "cancelled");

    const arquivado = await novoPlano("Plano arquivado");
    await createDateOption(ctxB, arquivado, { startsAt: asHoras(dia, 18) });
    await database
      .update(schema.plans)
      .set({ archivedAt: new Date() })
      .where(eq(schema.plans.id, arquivado));

    const planos = new Set(
      (await listMonthEntries(ctxB, MES)).map((e) => e.planId),
    );

    expect(planos.has(realizado)).toBe(true);
    expect(planos.has(cancelado)).toBe(false);
    expect(planos.has(arquivado)).toBe(false);

    for (const id of [realizado, cancelado, arquivado]) {
      await database.delete(schema.plans).where(eq(schema.plans.id, id));
    }
  });
});

describe("uma consulta por render (seção 4)", () => {
  it("o mês cheio de opções continua custando uma consulta só", async () => {
    /* Instrumentação: o pool do drizzle é alcançável por `$client`, e toda
       consulta passa por `query`. Contar aqui mede o que o documento proíbe —
       uma consulta por célula ou por plano — e não uma métrica indireta. */
    const pool = database.$client as { query: (...args: never[]) => unknown };
    const original = pool.query.bind(pool);

    const planos: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const plano = await novoPlano(`Plano denso ${i + 1}`);
      planos.push(plano);
      for (const dia of [5, 6, 7]) {
        await createDateOption(ctxB, plano, {
          startsAt: asHoras({ ...MES, day: dia }, 18 + (i % 4)),
        });
      }
    }

    let consultas = 0;
    pool.query = ((...args: never[]) => {
      consultas += 1;
      return original(...args);
    }) as typeof pool.query;

    let entradas;
    try {
      entradas = await listMonthEntries(ctxB, MES);
    } finally {
      pool.query = original as typeof pool.query;
    }

    // 18 opções em 6 planos e 3 dias distintos, numa consulta.
    expect(entradas.length).toBeGreaterThanOrEqual(18);
    expect(consultas).toBe(1);

    for (const id of planos) {
      await database.delete(schema.plans).where(eq(schema.plans.id, id));
    }
  });
});
