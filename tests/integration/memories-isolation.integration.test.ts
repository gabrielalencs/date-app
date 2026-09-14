import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { countQueries } from "@/db/query-counter.ts";
import * as schema from "@/db/schema/index.ts";
import {
  confirmDateOption,
  createDateOption,
  unconfirmDateOption,
  deleteDateOption,
} from "@/features/dates/data/mutations";
import {
  clearMemoryRating,
  rateMemory,
  saveMemoryNotes,
  setWouldRepeat,
} from "@/features/memories/data/mutations";
import {
  countMemories,
  listMemories,
  listPlanRatings,
} from "@/features/memories/data/queries";
import { addExpense } from "@/features/planning/data/mutations";
import {
  listExpenses,
  readPlanFacts,
} from "@/features/planning/data/queries";
import {
  changePlanStatus,
  createPlan,
} from "@/features/plans/data/mutations";
import { getPlan } from "@/features/plans/data/queries";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { addCivilDays, civilDateOf, startOfDayInApp } from "@/lib/datetime";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  DATE_STILL_AHEAD,
  NO_DATE_TO_COMPLETE,
  offerableTransitions,
} from "@/lib/plan-preconditions";

/**
 * O B9 contra o banco.
 *
 * Tudo acontece no workspace B, criado e removido aqui. Nenhum plano é criado
 * no workspace A: o `database.integration.test.ts` afirma que ele tem
 * exatamente os ids do seed (D-082).
 */
const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_B = "99999999-9999-4999-8999-999999999999";
const PROFILE_A = "seed_profile_alex";
const PROFILE_B1 = "seed_profile_memories_b1";
const PROFILE_B2 = "seed_profile_memories_b2";

type DatabaseModule = typeof import("@/db/client.ts");
let databaseModule: DatabaseModule | undefined;
let database: DatabaseModule["db"];

const ctxA: AuthorizedContext = {
  userId: PROFILE_A,
  profileId: PROFILE_A,
  workspaceId: WORKSPACE_A,
  role: "owner",
};

const ctxB1: AuthorizedContext = {
  userId: PROFILE_B1,
  profileId: PROFILE_B1,
  workspaceId: WORKSPACE_B,
  role: "owner",
};

const ctxB2: AuthorizedContext = {
  userId: PROFILE_B2,
  profileId: PROFILE_B2,
  workspaceId: WORKSPACE_B,
  role: "member",
};

/** Dias civis relativos a agora, para o teste não envelhecer. */
function diaCivil(offset: number): Date {
  return startOfDayInApp(addCivilDays(civilDateOf(new Date()), offset));
}

const ONTEM = diaCivil(-1);
const HOJE = diaCivil(0);
const AMANHA = diaCivil(1);

/** Plano em `planned`, com a data confirmada que se pedir. */
async function planoComData(titulo: string, quando: Date): Promise<string> {
  const plano = await createPlan(ctxB1, { title: titulo, category: "outro" });
  const opcao = await createDateOption(ctxB1, plano.id, { startsAt: quando });
  await confirmDateOption(ctxB1, opcao.id);
  return plano.id;
}

/** Plano já realizado — a travessia inteira, pelo caminho do produto. */
async function planoRealizado(titulo: string, quando = ONTEM): Promise<string> {
  const planId = await planoComData(titulo, quando);
  await changePlanStatus(ctxB1, planId, "completed");
  return planId;
}

async function statusDoPlano(planId: string): Promise<string> {
  return (await getPlan(ctxB1, planId)).status;
}

async function contarEventos(planId: string): Promise<number> {
  const [linha] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.activityEvents)
    .where(eq(schema.activityEvents.subjectId, planId));

  return linha?.total ?? 0;
}

async function verbosDoPlano(planId: string): Promise<string[]> {
  const linhas = await database
    .select({ verb: schema.activityEvents.verb })
    .from(schema.activityEvents)
    .where(eq(schema.activityEvents.subjectId, planId))
    .orderBy(schema.activityEvents.createdAt);

  return linhas.map((linha) => linha.verb);
}

beforeAll(async () => {
  if (process.env.NEON_BRANCH !== "development") {
    throw new Error("ABORTADO: test:db exige NEON_BRANCH=development.");
  }

  databaseModule = await import("@/db/client.ts");
  database = databaseModule.db;

  await database
    .insert(schema.workspaces)
    .values({ id: WORKSPACE_B, name: "Workspace de memórias B" })
    .onConflictDoNothing();

  for (const [id, nome] of [
    [PROFILE_B1, "Bruna"],
    [PROFILE_B2, "Caio"],
  ] as const) {
    await database
      .insert(schema.profiles)
      .values({ id, displayName: nome })
      .onConflictDoNothing();
    await database
      .insert(schema.workspaceMembers)
      .values({
        workspaceId: WORKSPACE_B,
        profileId: id,
        role: id === PROFILE_B1 ? "owner" : "member",
      })
      .onConflictDoNothing();
  }
});

afterAll(async () => {
  await database
    .delete(schema.workspaces)
    .where(eq(schema.workspaces.id, WORKSPACE_B));
  for (const id of [PROFILE_B1, PROFILE_B2]) {
    await database.delete(schema.profiles).where(eq(schema.profiles.id, id));
  }
  await databaseModule?.closeDatabasePool();
});

/* ------------------------------------------------------------------ *
 * A pré-condição da travessia
 * ------------------------------------------------------------------ */

describe("planned → completed exige data confirmada em dia não futuro", () => {
  it("recusa sem data confirmada", async () => {
    const plano = await createPlan(ctxB1, {
      title: "Sem data nenhuma",
      category: "outro",
    });
    /* Chega a `planned` por um caminho que não é o botão: confirma a data e
       depois a desmarca deixaria em `deciding`. Aqui o estado é montado
       direto, porque o que se prova é a pré-condição da travessia. */
    await database
      .update(schema.plans)
      .set({ status: "planned" })
      .where(eq(schema.plans.id, plano.id));

    await expect(
      changePlanStatus(ctxB1, plano.id, "completed"),
    ).rejects.toThrowError(NO_DATE_TO_COMPLETE);

    expect(await statusDoPlano(plano.id)).toBe("planned");
  });

  it("recusa com data confirmada no futuro", async () => {
    const plano = await planoComData("Date de amanhã", AMANHA);

    await expect(
      changePlanStatus(ctxB1, plano, "completed"),
    ).rejects.toThrowError(DATE_STILL_AHEAD);

    expect(await statusDoPlano(plano)).toBe("planned");
  });

  it("aceita com data de hoje — hoje conta, amanhã não", async () => {
    /* O caso que uma comparação por milissegundos erraria: `startsAt` é a
       meia-noite de hoje, e às 15h de hoje ela está no passado; mas um date
       hoje às 20h teria `startsAt` no futuro e precisa ser aceito igual, porque
       a comparação é de dia civil (B7). */
    const plano = await planoComData("Date de hoje", HOJE);

    await changePlanStatus(ctxB1, plano, "completed");
    expect(await statusDoPlano(plano)).toBe("completed");
  });

  it("a interface não oferece o botão que seria recusado", async () => {
    const amanha = await planoComData("Ainda vai acontecer", AMANHA);
    const ontem = await planoComData("Já aconteceu", ONTEM);

    const factsAmanha = await readPlanFacts(ctxB1, amanha);
    const factsOntem = await readPlanFacts(ctxB1, ontem);

    expect(factsAmanha.hasConfirmedDate).toBe(true);
    expect(factsAmanha.confirmedDateHasArrived).toBe(false);
    expect(offerableTransitions("planned", factsAmanha)).not.toContain(
      "completed",
    );

    expect(factsOntem.confirmedDateHasArrived).toBe(true);
    expect(offerableTransitions("planned", factsOntem)).toContain("completed");
  });
});

/* ------------------------------------------------------------------ *
 * Terminal na transição, não na escrita
 * ------------------------------------------------------------------ */

describe("completed é terminal na transição", () => {
  it("nenhuma transição sai de completed", async () => {
    const plano = await planoRealizado("Não sai mais daqui");

    for (const destino of [
      "idea",
      "deciding",
      "planned",
      "reserved",
      "cancelled",
    ] as const) {
      await expect(
        changePlanStatus(ctxB1, plano, destino),
      ).rejects.toThrowError(/não é permitida/);
    }

    expect(await statusDoPlano(plano)).toBe("completed");
  });

  it("e a interface não oferece nenhuma", async () => {
    const plano = await planoRealizado("Sem botão de volta");
    const facts = await readPlanFacts(ctxB1, plano);

    expect(offerableTransitions("completed", facts)).toEqual([]);
  });
});

describe("completed NÃO é terminal na escrita (seção 3)", () => {
  it("avaliar, escrever e lançar gasto funcionam num plano realizado", async () => {
    const plano = await planoRealizado("Realizado e vivo");

    await rateMemory(ctxB1, plano, 5);
    await setWouldRepeat(ctxB1, plano, "yes");
    await saveMemoryNotes(ctxB1, plano, {
      highlight: "A caminhada de volta",
      notes: "Ir mais cedo da próxima vez.",
    });

    // O gasto é do B8 e continua editável: é depois que se sabe quanto custou.
    await addExpense(ctxB1, plano, { label: "Jantar", amountCents: 12_000 });

    const { mine, summary } = await listPlanRatings(ctxB1, plano);
    expect(mine?.rating).toBe(5);
    expect(mine?.wouldRepeat).toBe("yes");
    expect(mine?.highlight).toBe("A caminhada de volta");
    expect(await listExpenses(ctxB1, plano)).toHaveLength(1);

    // Uma pessoa só: ainda não há média.
    expect(summary.average).toBeNull();
  });

  it("avaliar um plano que ainda não é realizado é recusado", async () => {
    const plano = await planoComData("Ainda não aconteceu", AMANHA);

    await expect(rateMemory(ctxB1, plano, 4)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

/* ------------------------------------------------------------------ *
 * O cadeado do B6
 * ------------------------------------------------------------------ */

describe("o cadeado do B6 continua fechado", () => {
  it("desconfirmar a data de um plano realizado é recusado", async () => {
    const plano = await planoRealizado("Data trancada");

    await expect(unconfirmDateOption(ctxB1, plano)).rejects.toBeInstanceOf(
      ValidationError,
    );

    const facts = await readPlanFacts(ctxB1, plano);
    expect(facts.hasConfirmedDate).toBe(true);
  });

  it("apagar a data confirmada de um plano realizado é recusado", async () => {
    const plano = await planoRealizado("Data que não se apaga");

    const [opcao] = await database
      .select({ id: schema.planDateOptions.id })
      .from(schema.planDateOptions)
      .where(eq(schema.planDateOptions.planId, plano));

    await expect(deleteDateOption(ctxB1, opcao!.id)).rejects.toThrowError(
      /data confirmada/,
    );
  });
});

/* ------------------------------------------------------------------ *
 * Avaliação
 * ------------------------------------------------------------------ */

describe("avaliação das duas pessoas (seção 4)", () => {
  let plano = "";

  beforeEach(async () => {
    plano = await planoRealizado("Plano da avaliação");
  });

  it("uma pessoa avaliando não produz média; as duas produzem", async () => {
    await rateMemory(ctxB1, plano, 5);

    const so = await listPlanRatings(ctxB1, plano);
    expect(so.summary.average).toBeNull();
    expect(so.summary.answered).toBe(1);

    await rateMemory(ctxB2, plano, 4);

    const duas = await listPlanRatings(ctxB1, plano);
    expect(duas.summary.average).toBe(4.5);
    expect(duas.summary.answered).toBe(2);
  });

  it("a ausência aparece como ausência, não como zero", async () => {
    await rateMemory(ctxB1, plano, 3);

    const { members } = await listPlanRatings(ctxB1, plano);

    expect(members).toHaveLength(2);
    const caio = members.find((m) => m.profileId === PROFILE_B2)!;

    expect(caio.rating).toBeNull();
    expect(caio.rating).not.toBe(0);
    expect(caio.displayName).toBe("Caio");
  });

  it("reenviar a mesma nota retira a avaliação", async () => {
    await rateMemory(ctxB1, plano, 4);
    expect((await listPlanRatings(ctxB1, plano)).mine?.rating).toBe(4);

    // É o que a action faz quando o controle manda valor vazio.
    await clearMemoryRating(ctxB1, plano);

    const depois = await listPlanRatings(ctxB1, plano);
    expect(depois.mine?.rating).toBeNull();
    expect(depois.summary.answered).toBe(0);
  });

  it("mudar de nota não apaga o que a pessoa escreveu", async () => {
    await rateMemory(ctxB1, plano, 3);
    await saveMemoryNotes(ctxB1, plano, {
      highlight: "O fim da tarde",
      notes: null,
    });

    await rateMemory(ctxB1, plano, 5);

    const { mine } = await listPlanRatings(ctxB1, plano);
    expect(mine?.rating).toBe(5);
    expect(mine?.highlight).toBe("O fim da tarde");
  });

  it("retirar a nota leva os textos junto — rating é NOT NULL", async () => {
    await rateMemory(ctxB1, plano, 3);
    await saveMemoryNotes(ctxB1, plano, {
      highlight: "Some junto",
      notes: "Isto também",
    });

    await clearMemoryRating(ctxB1, plano);

    const { mine } = await listPlanRatings(ctxB1, plano);
    expect(mine?.highlight).toBeNull();
    expect(mine?.notes).toBeNull();
  });

  it("escrever antes de dar nota é recusado, com frase", async () => {
    await expect(
      saveMemoryNotes(ctxB1, plano, { highlight: "Sem nota", notes: null }),
    ).rejects.toThrowError(/Dê uma nota antes/);
  });

  it("ninguém escreve na avaliação do outro", async () => {
    await rateMemory(ctxB1, plano, 5);
    await rateMemory(ctxB2, plano, 2);

    await setWouldRepeat(ctxB2, plano, "no");

    const { members } = await listPlanRatings(ctxB1, plano);
    const bruna = members.find((m) => m.profileId === PROFILE_B1)!;
    const caio = members.find((m) => m.profileId === PROFILE_B2)!;

    expect(bruna.rating).toBe(5);
    expect(bruna.wouldRepeat).toBeNull();
    expect(caio.rating).toBe(2);
    expect(caio.wouldRepeat).toBe("no");
  });
});

describe("o que o banco garante, e não a camada de dados", () => {
  it("uma avaliação por (plano, pessoa), burlando a camada", async () => {
    const plano = await planoRealizado("Plano do único");
    await rateMemory(ctxB1, plano, 4);

    await expect(
      database.insert(schema.memoryRatings).values({
        workspaceId: WORKSPACE_B,
        planId: plano,
        profileId: PROFILE_B1,
        rating: 2,
      }),
    ).rejects.toThrow();
  });

  it("nota fora de 1–5 é recusada pelo CHECK, burlando a camada", async () => {
    const plano = await planoRealizado("Plano do CHECK");

    for (const nota of [0, 6, -1]) {
      await expect(
        database.insert(schema.memoryRatings).values({
          workspaceId: WORKSPACE_B,
          planId: plano,
          profileId: PROFILE_B1,
          rating: nota,
        }),
      ).rejects.toThrow();
    }
  });
});

/* ------------------------------------------------------------------ *
 * Eventos
 * ------------------------------------------------------------------ */

describe("eventos (seção 8)", () => {
  it("concluir emite uma vez; a primeira avaliação de cada pessoa emite uma vez", async () => {
    const plano = await planoComData("Plano do feed", ONTEM);
    const antesDaTravessia = await contarEventos(plano);

    await changePlanStatus(ctxB1, plano, "completed");
    expect(await contarEventos(plano)).toBe(antesDaTravessia + 1);

    await rateMemory(ctxB1, plano, 5);
    expect(await contarEventos(plano)).toBe(antesDaTravessia + 2);

    await rateMemory(ctxB2, plano, 4);
    expect(await contarEventos(plano)).toBe(antesDaTravessia + 3);

    const verbos = await verbosDoPlano(plano);
    expect(verbos.filter((v) => v === "plan_completed")).toHaveLength(1);
    expect(verbos.filter((v) => v === "memory_added")).toHaveLength(2);
  });

  it("editar a nota três vezes não acrescenta linha nenhuma", async () => {
    const plano = await planoRealizado("Plano da edição");
    await rateMemory(ctxB1, plano, 3);

    const antes = await contarEventos(plano);

    await rateMemory(ctxB1, plano, 4);
    await rateMemory(ctxB1, plano, 5);
    await rateMemory(ctxB1, plano, 2);
    await setWouldRepeat(ctxB1, plano, "maybe");
    await saveMemoryNotes(ctxB1, plano, {
      highlight: "Mudei de ideia de novo",
      notes: null,
    });

    expect(await contarEventos(plano)).toBe(antes);
  });

  it("retirar e reavaliar não emite de novo — quem já avaliou já entrou no feed", async () => {
    const plano = await planoRealizado("Plano do vai e volta");

    await rateMemory(ctxB1, plano, 4);
    const depoisDaPrimeira = await contarEventos(plano);

    await clearMemoryRating(ctxB1, plano);
    expect(await contarEventos(plano)).toBe(depoisDaPrimeira);

    /* Retirar apaga a linha, então a próxima nota é "primeira" de novo para o
       banco. Emitir aqui seria contar duas vezes o mesmo acontecimento — mas
       não emitir exigiria guardar que a pessoa já avaliou algum dia, e esse é
       um estado que o produto não tem. O feed do B10 vai ver duas linhas de um
       date em que a pessoa mudou de ideia sobre avaliar; é o preço, e é
       pequeno. */
    await rateMemory(ctxB1, plano, 5);
    expect(await contarEventos(plano)).toBe(depoisDaPrimeira + 1);
  });
});

/* ------------------------------------------------------------------ *
 * Escala — a exigência medida da seção 7
 * ------------------------------------------------------------------ */

describe("o número de consultas da timeline é constante", () => {
  /** Ids do fixture em escala: criados e removidos aqui, sem tocar no seed. */
  const EM_ESCALA: string[] = [];

  afterAll(async () => {
    if (EM_ESCALA.length > 0) {
      await database
        .delete(schema.plans)
        .where(inArray(schema.plans.id, EM_ESCALA));
    }
  });

  it("conta o mesmo com um plano e com sessenta", async () => {
    const umSo = await planoRealizado("O único realizado do B");

    const comUm = await countQueries(() => listMemories(ctxB1, { page: 1 }));
    expect(comUm.result.total).toBeGreaterThanOrEqual(1);

    /* Sessenta planos realizados, inseridos direto: o que se mede é a leitura,
       e sessenta travessias pela camada de dados levariam minutos sem provar
       nada a mais. */
    const base = civilDateOf(new Date());
    const planos = Array.from({ length: 60 }, (_, i) => ({
      id: crypto.randomUUID(),
      workspaceId: WORKSPACE_B,
      title: `Realizado em escala ${i + 1}`,
      category: "outro",
      status: "completed" as const,
      createdBy: PROFILE_B1,
    }));

    EM_ESCALA.push(...planos.map((plano) => plano.id));

    await database.insert(schema.plans).values(planos);
    await database.insert(schema.planDateOptions).values(
      planos.map((plano, i) => ({
        workspaceId: WORKSPACE_B,
        planId: plano.id,
        // Espalhados por vários meses, para a timeline agrupar de verdade.
        startsAt: startOfDayInApp(addCivilDays(base, -(i + 2))),
        isConfirmed: true,
        createdBy: PROFILE_B1,
      })),
    );

    expect(await countMemories(ctxB1)).toBeGreaterThanOrEqual(61);

    const comSessenta = await countQueries(() =>
      listMemories(ctxB1, { page: 1 }),
    );

    /* O número, e não a sensação: se a página buscasse capa, contagem de fotos
       ou avaliação por linha, este segundo número seria dezenas de vezes maior
       que o primeiro — e nada disso apareceria com os oito planos do seed. */
    expect(comSessenta.queries).toBe(comUm.queries);
    expect(comSessenta.result.entries.length).toBeGreaterThan(
      comUm.result.entries.length,
    );

    // E a última página custa o mesmo que a primeira.
    const ultima = await countQueries(() =>
      listMemories(ctxB1, { page: comSessenta.result.pageCount }),
    );
    expect(ultima.queries).toBe(comUm.queries);

    expect(umSo).toBeTruthy();
  });

  it("o detalhe do plano realizado também não cresce por linha", async () => {
    const plano = await planoRealizado("Detalhe medido");

    const vazio = await countQueries(() => listPlanRatings(ctxB1, plano));

    await rateMemory(ctxB1, plano, 5);
    await rateMemory(ctxB2, plano, 4);

    const cheio = await countQueries(() => listPlanRatings(ctxB1, plano));

    expect(cheio.queries).toBe(vazio.queries);
    expect(cheio.result.members).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ *
 * Dois workspaces
 * ------------------------------------------------------------------ */

describe("nada atravessa o workspace", () => {
  let planoDeB = "";

  beforeAll(async () => {
    planoDeB = await planoRealizado("Memória do B");
    await rateMemory(ctxB1, planoDeB, 5);
    await saveMemoryNotes(ctxB1, planoDeB, {
      highlight: "Isto é do B",
      notes: null,
    });
  });

  it("o A não lê a avaliação do B", async () => {
    const doA = await listPlanRatings(ctxA, planoDeB);

    /* Os membros que voltam são os do A; nenhuma avaliação do B aparece, e o
       `mine` do A é nulo porque ele não é membro de lá. */
    expect(doA.members.every((m) => m.rating === null)).toBe(true);
    expect(doA.summary.answered).toBe(0);
  });

  it("o A não cria nem altera avaliação no plano do B", async () => {
    await expect(rateMemory(ctxA, planoDeB, 1)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    await expect(
      setWouldRepeat(ctxA, planoDeB, "no"),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      saveMemoryNotes(ctxA, planoDeB, { highlight: "invasor", notes: null }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const doB = await listPlanRatings(ctxB1, planoDeB);
    expect(doB.mine?.rating).toBe(5);
    expect(doB.mine?.highlight).toBe("Isto é do B");
  });

  it("o A não apaga a avaliação do B", async () => {
    await expect(
      clearMemoryRating(ctxA, planoDeB),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect((await listPlanRatings(ctxB1, planoDeB)).mine?.rating).toBe(5);
  });

  it("o A não marca o plano do B como realizado", async () => {
    const planoNovo = await planoComData("Do B, ainda planejado", ONTEM);

    await expect(
      changePlanStatus(ctxA, planoNovo, "completed"),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await statusDoPlano(planoNovo)).toBe("planned");
  });

  it("a timeline do A não mostra nada do B, em página nenhuma", async () => {
    const doA = await listMemories(ctxA, { page: 1, perPage: 100 });
    const idsDeA = doA.entries.map((entry) => entry.planId);

    const idsDeB = (
      await database
        .select({ id: schema.plans.id })
        .from(schema.plans)
        .where(eq(schema.plans.workspaceId, WORKSPACE_B))
    ).map((linha) => linha.id);

    for (const id of idsDeB) {
      expect(idsDeA).not.toContain(id);
    }

    // E percorrendo todas as páginas do A, não só a primeira.
    for (let pagina = 1; pagina <= doA.pageCount; pagina += 1) {
      const p = await listMemories(ctxA, { page: pagina });
      for (const entry of p.entries) {
        expect(idsDeB).not.toContain(entry.planId);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * A timeline
 * ------------------------------------------------------------------ */

describe("a timeline lista o que deve", () => {
  it("plano realizado entra; cancelado, arquivado e planejado não", async () => {
    const realizado = await planoRealizado("Entra na timeline");
    const planejado = await planoComData("Não entra: planejado", AMANHA);

    const cancelado = await planoComData("Não entra: cancelado", ONTEM);
    await changePlanStatus(ctxB1, cancelado, "cancelled");

    const arquivado = await planoRealizado("Não entra: arquivado");
    await database
      .update(schema.plans)
      .set({ archivedAt: new Date() })
      .where(eq(schema.plans.id, arquivado));

    const { entries } = await listMemories(ctxB1, { page: 1, perPage: 200 });
    const ids = entries.map((entry) => entry.planId);

    expect(ids).toContain(realizado);
    expect(ids).not.toContain(planejado);
    expect(ids).not.toContain(cancelado);
    expect(ids).not.toContain(arquivado);
  });

  it("vem do mais recente para o mais antigo", async () => {
    const { entries } = await listMemories(ctxB1, { page: 1, perPage: 200 });

    for (let i = 1; i < entries.length; i += 1) {
      expect(entries[i - 1]!.happenedAt.getTime()).toBeGreaterThanOrEqual(
        entries[i]!.happenedAt.getTime(),
      );
    }
  });

  it("página além do fim cai na última, sem erro e sem lista quebrada", async () => {
    const pedida = await listMemories(ctxB1, { page: 9999, perPage: 5 });

    expect(pedida.page).toBe(pedida.pageCount);
    expect(pedida.entries.length).toBeGreaterThan(0);
  });

  it("cada página traz itens diferentes, sem repetir nem pular", async () => {
    const total = await countMemories(ctxB1);
    const vistos = new Set<string>();

    const primeira = await listMemories(ctxB1, { page: 1, perPage: 5 });

    for (let pagina = 1; pagina <= primeira.pageCount; pagina += 1) {
      const p = await listMemories(ctxB1, { page: pagina, perPage: 5 });
      for (const entry of p.entries) {
        expect(vistos.has(entry.planId)).toBe(false);
        vistos.add(entry.planId);
      }
    }

    expect(vistos.size).toBe(total);
  });
});
