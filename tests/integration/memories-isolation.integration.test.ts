import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema/index.ts";
import {
  confirmDateOption,
  createDateOption,
  deleteDateOption,
  unconfirmDateOption,
} from "@/features/dates/data/mutations";
import {
  clearMemoryRating,
  saveMemoryText,
  setMemoryRating,
  setMemoryRepeat,
} from "@/features/memories/data/mutations";
import {
  getPlanMemory,
  listMemoryTimeline,
} from "@/features/memories/data/queries";
import { MEMORIES_PER_PAGE } from "@/features/memories/constants";
import {
  addChecklistItem,
  addExpense,
} from "@/features/planning/data/mutations";
import { readPlanFacts } from "@/features/planning/data/queries";
import { changePlanStatus, createPlan } from "@/features/plans/data/mutations";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { addCivilDays, civilDateOf, startOfDayInApp } from "@/lib/datetime";
import { ValidationError } from "@/lib/errors";
import { InvalidTransitionError } from "@/lib/plan-status";
import { offerableTransitions } from "@/lib/plan-preconditions";

/**
 * As memórias contra o banco: isolamento entre workspaces, as pré-condições da
 * travessia, os invariantes que só o banco pode garantir, os eventos e — o que
 * este bloco não podia deixar por opinião — a **contagem de consultas** com um
 * plano e com sessenta.
 *
 * Tudo acontece no workspace B, criado e removido aqui. Nenhum plano é criado
 * no workspace A: o `database.integration.test.ts` afirma que ele tem
 * exatamente os oito ids do seed (D-082 — a fixture devolve o que estava).
 */
const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_B = "99999999-9999-4999-8999-999999999999";
const PROFILE_A = "seed_profile_alex";
const PROFILE_B1 = "seed_profile_memory_b1";
const PROFILE_B2 = "seed_profile_memory_b2";

type DatabaseModule = typeof import("@/db/client.ts");
let databaseModule: DatabaseModule | undefined;
let database: DatabaseModule["db"];

const ctxA: AuthorizedContext = {
  userId: PROFILE_A,
  profileId: PROFILE_A,
  workspaceId: WORKSPACE_A,
  role: "owner",
};

/** As duas pessoas do workspace B: a avaliação é de cada uma. */
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

/** Hora de parede em São Paulo a partir de um dia civil. */
function asHoras(
  civil: { year: number; month: number; day: number },
  hora: number,
  minuto = 0,
): Date {
  return new Date(
    startOfDayInApp(civil).getTime() + (hora * 60 + minuto) * 60_000,
  );
}

const HOJE = civilDateOf(new Date());
const ONTEM = addCivilDays(HOJE, -1);
const AMANHA = addCivilDays(HOJE, 1);

/**
 * Um plano realizado, pelo caminho do produto: data sugerida, confirmada
 * (que move para `planned`), e a travessia para `completed`.
 */
async function planoRealizado(
  ctx: AuthorizedContext,
  titulo: string,
  quando = asHoras(ONTEM, 20),
): Promise<string> {
  const plano = await createPlan(ctx, { title: titulo, category: "outro" });
  const opcao = await createDateOption(ctx, plano.id, { startsAt: quando });
  await confirmDateOption(ctx, opcao.id);
  await changePlanStatus(ctx, plano.id, "completed");
  return plano.id;
}

/** Quantos eventos daquele verbo o workspace B já tem. */
async function contarEventos(verb: "plan_completed" | "memory_added") {
  const [linha] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.activityEvents)
    .where(
      and(
        eq(schema.activityEvents.workspaceId, WORKSPACE_B),
        eq(schema.activityEvents.verb, verb),
      ),
    );

  return Number(linha?.total ?? 0);
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

  await database
    .insert(schema.profiles)
    .values([
      { id: PROFILE_B1, displayName: "Dani" },
      { id: PROFILE_B2, displayName: "Rô" },
    ])
    .onConflictDoNothing();

  await database
    .insert(schema.workspaceMembers)
    .values([
      { workspaceId: WORKSPACE_B, profileId: PROFILE_B1, role: "owner" },
      { workspaceId: WORKSPACE_B, profileId: PROFILE_B2, role: "member" },
    ])
    .onConflictDoNothing();
});

afterAll(async () => {
  await database
    .delete(schema.workspaces)
    .where(eq(schema.workspaces.id, WORKSPACE_B));
  await database
    .delete(schema.profiles)
    .where(inArray(schema.profiles.id, [PROFILE_B1, PROFILE_B2]));
  await databaseModule?.closeDatabasePool();
});

describe("a pré-condição de completed", () => {
  it("recusa sem data confirmada", async () => {
    const plano = await createPlan(ctxB1, {
      title: "Sem data nenhuma",
      category: "outro",
    });

    // `planned` também é recusado sem data (D-063), então o caminho até
    // `completed` é forçado a partir de `deciding`.
    await changePlanStatus(ctxB1, plano.id, "deciding");

    await expect(
      changePlanStatus(ctxB1, plano.id, "completed"),
    ).rejects.toThrow(InvalidTransitionError);

    const facts = await readPlanFacts(ctxB1, plano.id);
    expect(facts.hasConfirmedDate).toBe(false);
    expect(offerableTransitions("planned", facts)).not.toContain("completed");
  });

  it("recusa com data confirmada no futuro", async () => {
    const plano = await createPlan(ctxB1, {
      title: "Date de semana que vem",
      category: "outro",
    });
    const opcao = await createDateOption(ctxB1, plano.id, {
      startsAt: asHoras(AMANHA, 20),
    });
    await confirmDateOption(ctxB1, opcao.id);

    const facts = await readPlanFacts(ctxB1, plano.id);
    expect(facts.hasConfirmedDate).toBe(true);
    expect(facts.confirmedDateIsFuture).toBe(true);

    // A interface não oferece o botão...
    expect(offerableTransitions("planned", facts)).not.toContain("completed");

    // ...e a mutation recusa de novo, que é a segunda das duas consultas.
    await expect(
      changePlanStatus(ctxB1, plano.id, "completed"),
    ).rejects.toThrow(ValidationError);
  });

  it("aceita com data de hoje — hoje conta, amanhã não", async () => {
    const plano = await createPlan(ctxB1, {
      title: "Date de hoje cedo",
      category: "outro",
    });
    const opcao = await createDateOption(ctxB1, plano.id, {
      startsAt: asHoras(HOJE, 9),
    });
    await confirmDateOption(ctxB1, opcao.id);

    const facts = await readPlanFacts(ctxB1, plano.id);
    expect(facts.confirmedDateIsFuture).toBe(false);
    expect(offerableTransitions("planned", facts)).toContain("completed");

    const realizado = await changePlanStatus(ctxB1, plano.id, "completed");
    expect(realizado.status).toBe("completed");
  });

  it("um date de hoje às 23h continua sendo de hoje ao meio-dia", async () => {
    /* Dia civil, não subtração de milissegundos: às 12h, um date marcado para
       as 23h de hoje ainda está 11 horas no futuro em instantes, e mesmo assim
       é hoje (D-061). */
    const plano = await createPlan(ctxB1, {
      title: "Date de hoje à noite",
      category: "outro",
    });
    const opcao = await createDateOption(ctxB1, plano.id, {
      startsAt: asHoras(HOJE, 23, 30),
    });
    await confirmDateOption(ctxB1, opcao.id);

    const facts = await readPlanFacts(ctxB1, plano.id, undefined, asHoras(HOJE, 12));
    expect(facts.confirmedDateIsFuture).toBe(false);
  });
});

describe("terminal na transição, não na escrita", () => {
  let plano = "";

  beforeAll(async () => {
    plano = await planoRealizado(ctxB1, "Terminal mas vivo");
  });

  it("nenhuma transição sai de completed", async () => {
    for (const destino of [
      "idea",
      "deciding",
      "planned",
      "reserved",
      "cancelled",
    ] as const) {
      await expect(
        changePlanStatus(ctxB1, plano, destino),
      ).rejects.toThrow(InvalidTransitionError);
    }
  });

  it("e a interface não oferece nenhuma", async () => {
    const facts = await readPlanFacts(ctxB1, plano);
    expect(offerableTransitions("completed", facts)).toEqual([]);
  });

  it("avaliar funciona num plano completed", async () => {
    await setMemoryRating(ctxB1, plano, 5);
    const memoria = await getPlanMemory(ctxB1, plano);

    expect(
      memoria.ratings.find((r) => r.profileId === PROFILE_B1)?.rating,
    ).toBe(5);
  });

  it("lançar gasto continua funcionando num plano completed", async () => {
    await addExpense(ctxB1, plano, {
      label: "Jantar",
      amountCents: 12_345,
    });

    const [linha] = await database
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.expenses)
      .where(eq(schema.expenses.planId, plano));

    expect(Number(linha?.total)).toBe(1);
  });

  it("guardar foto de memória continua funcionando num plano completed", async () => {
    /* A linha de `media` é inserida direto: o fluxo do B5 exige R2, que tem
       suíte própria (`test:media`). O que se prova aqui é que o `purpose`
       `memory` é aceito num plano terminal e entra na contagem da timeline. */
    await database.insert(schema.media).values({
      workspaceId: WORKSPACE_B,
      planId: plano,
      objectKey: `${WORKSPACE_B}/${plano}/${crypto.randomUUID()}/full.webp`,
      thumbObjectKey: `${WORKSPACE_B}/${plano}/${crypto.randomUUID()}/thumb.webp`,
      mimeType: "image/webp",
      sizeBytes: 1024,
      purpose: "memory",
      uploadedBy: PROFILE_B1,
    });

    const pagina = await listMemoryTimeline(ctxB1, 1);
    const card = pagina.items.find((item) => item.planId === plano);

    expect(card?.photoCount).toBe(1);
  });

  it("o checklist, ao contrário, fecha: 'o que levar' já não tem função", async () => {
    await expect(
      addChecklistItem(ctxB1, plano, "Levar guarda-chuva"),
    ).rejects.toThrow(ValidationError);
  });

  it("o cadeado do B6 continua fechado: a data não se desmarca nem se apaga", async () => {
    await expect(unconfirmDateOption(ctxB1, plano)).rejects.toThrow(
      ValidationError,
    );

    const [opcao] = await database
      .select({ id: schema.planDateOptions.id })
      .from(schema.planDateOptions)
      .where(eq(schema.planDateOptions.planId, plano));

    await expect(deleteDateOption(ctxB1, opcao!.id)).rejects.toThrow(
      ValidationError,
    );
  });
});

describe("avaliação — as regras da votação, aplicadas à nota", () => {
  let plano = "";

  beforeAll(async () => {
    plano = await planoRealizado(ctxB1, "Jantar para avaliar");
  });

  it("uma pessoa avaliando não produz média", async () => {
    await setMemoryRating(ctxB1, plano, 4);
    const memoria = await getPlanMemory(ctxB1, plano);

    expect(memoria.averageTenths).toBeNull();
    expect(memoria.ratings).toHaveLength(2);
  });

  it("ausência aparece como ausência, não como zero", async () => {
    const memoria = await getPlanMemory(ctxB1, plano);
    const outra = memoria.ratings.find((r) => r.profileId === PROFILE_B2);

    expect(outra?.rating).toBeNull();
    expect(outra?.rating).not.toBe(0);
  });

  it("as duas avaliando produzem média", async () => {
    await setMemoryRating(ctxB2, plano, 5);
    const memoria = await getPlanMemory(ctxB1, plano);

    expect(memoria.averageTenths).toBe(45);
  });

  it("reenviar a mesma nota a retira, e a média some junto", async () => {
    await clearMemoryRating(ctxB2, plano);
    const memoria = await getPlanMemory(ctxB1, plano);

    expect(
      memoria.ratings.find((r) => r.profileId === PROFILE_B2)?.rating,
    ).toBeNull();
    expect(memoria.averageTenths).toBeNull();
  });

  it("retirar a nota leva o repetiria junto, porque nota é NOT NULL", async () => {
    await setMemoryRating(ctxB2, plano, 3);
    await setMemoryRepeat(ctxB2, plano, "yes");

    let memoria = await getPlanMemory(ctxB1, plano);
    expect(
      memoria.ratings.find((r) => r.profileId === PROFILE_B2)?.wouldRepeat,
    ).toBe("yes");

    await clearMemoryRating(ctxB2, plano);
    memoria = await getPlanMemory(ctxB1, plano);

    const depois = memoria.ratings.find((r) => r.profileId === PROFILE_B2);
    expect(depois?.rating).toBeNull();
    expect(depois?.wouldRepeat).toBeNull();
  });

  it("repetiria sem nota é recusado", async () => {
    await expect(setMemoryRepeat(ctxB2, plano, "no")).rejects.toThrow(
      ValidationError,
    );
  });

  it("a melhor parte e as observações são do casal, uma por plano", async () => {
    await saveMemoryText(ctxB1, plano, {
      highlight: "A sobremesa",
      notes: "Chegamos cedo e deu certo.",
    });
    await saveMemoryText(ctxB2, plano, {
      highlight: "A sobremesa mesmo",
      notes: "Chegamos cedo e deu certo.",
    });

    const [linhas] = await database
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.memories)
      .where(eq(schema.memories.planId, plano));

    expect(Number(linhas?.total)).toBe(1);

    const memoria = await getPlanMemory(ctxB1, plano);
    expect(memoria.memory?.highlight).toBe("A sobremesa mesmo");
  });

  it("avaliar plano que ainda não aconteceu é recusado", async () => {
    const aberto = await createPlan(ctxB1, {
      title: "Ainda vai acontecer",
      category: "outro",
    });

    await expect(setMemoryRating(ctxB1, aberto.id, 5)).rejects.toThrow(
      ValidationError,
    );
  });
});

describe("o banco recusa o que só ele pode recusar", () => {
  let memoryId = "";

  beforeAll(async () => {
    const plano = await planoRealizado(ctxB1, "Plano dos invariantes");
    await setMemoryRating(ctxB1, plano, 3);

    const [linha] = await database
      .select({ id: schema.memories.id })
      .from(schema.memories)
      .where(eq(schema.memories.planId, plano));

    memoryId = linha!.id;
  });

  it("duas notas da mesma pessoa na mesma memória, burlando a camada de dados", async () => {
    await expect(
      database.insert(schema.memoryRatings).values({
        workspaceId: WORKSPACE_B,
        memoryId,
        profileId: PROFILE_B1,
        rating: 5,
      }),
    ).rejects.toThrow();
  });

  it("nota fora de 1 a 5, burlando a camada de dados", async () => {
    for (const rating of [0, 6, -1]) {
      await expect(
        database.insert(schema.memoryRatings).values({
          workspaceId: WORKSPACE_B,
          memoryId,
          profileId: PROFILE_B2,
          rating,
        }),
      ).rejects.toThrow();
    }
  });

  it("duas memórias para o mesmo plano", async () => {
    const [linha] = await database
      .select({ planId: schema.memories.planId })
      .from(schema.memories)
      .where(eq(schema.memories.id, memoryId));

    await expect(
      database.insert(schema.memories).values({
        workspaceId: WORKSPACE_B,
        planId: linha!.planId,
      }),
    ).rejects.toThrow();
  });
});

describe("eventos — o que entra no feed e o que não entra", () => {
  it("concluir emite uma vez; a primeira avaliação de cada pessoa emite uma vez", async () => {
    const concluidosAntes = await contarEventos("plan_completed");
    const memoriasAntes = await contarEventos("memory_added");

    const plano = await planoRealizado(ctxB1, "Plano dos eventos");

    expect(await contarEventos("plan_completed")).toBe(concluidosAntes + 1);
    expect(await contarEventos("memory_added")).toBe(memoriasAntes);

    await setMemoryRating(ctxB1, plano, 4);
    expect(await contarEventos("memory_added")).toBe(memoriasAntes + 1);

    await setMemoryRating(ctxB2, plano, 2);
    expect(await contarEventos("memory_added")).toBe(memoriasAntes + 2);

    // Editar a nota três vezes não acrescenta linha nenhuma.
    await setMemoryRating(ctxB1, plano, 5);
    await setMemoryRating(ctxB1, plano, 3);
    await setMemoryRating(ctxB1, plano, 1);
    expect(await contarEventos("memory_added")).toBe(memoriasAntes + 2);

    // Nem o "repetiria", nem a melhor parte, nem a foto de memória.
    await setMemoryRepeat(ctxB1, plano, "maybe");
    await saveMemoryText(ctxB1, plano, { highlight: "O bis", notes: null });
    await database.insert(schema.media).values({
      workspaceId: WORKSPACE_B,
      planId: plano,
      objectKey: `${WORKSPACE_B}/${plano}/${crypto.randomUUID()}/full.webp`,
      thumbObjectKey: `${WORKSPACE_B}/${plano}/${crypto.randomUUID()}/thumb.webp`,
      mimeType: "image/webp",
      sizeBytes: 2048,
      purpose: "memory",
      uploadedBy: PROFILE_B1,
    });

    expect(await contarEventos("memory_added")).toBe(memoriasAntes + 2);

    /* Retirar e reavaliar emite de novo: a linha nasceu outra vez, e o feed
       conta o que aconteceu. Não é edição, é uma avaliação nova. */
    await clearMemoryRating(ctxB2, plano);
    expect(await contarEventos("memory_added")).toBe(memoriasAntes + 2);

    await setMemoryRating(ctxB2, plano, 4);
    expect(await contarEventos("memory_added")).toBe(memoriasAntes + 3);
  });
});

describe("dois workspaces não se tocam", () => {
  let planoDeB = "";

  beforeAll(async () => {
    planoDeB = await planoRealizado(ctxB1, "Memória privada do B");
    await setMemoryRating(ctxB1, planoDeB, 5);
    await saveMemoryText(ctxB1, planoDeB, {
      highlight: "Segredo do B",
      notes: null,
    });
  });

  it("a timeline de A não mostra nada de B, em página nenhuma", async () => {
    for (const pagina of [1, 2, 3]) {
      const vista = await listMemoryTimeline(ctxA, pagina);
      expect(vista.items.map((item) => item.planId)).not.toContain(planoDeB);
    }
  });

  it("A não lê a memória de um plano de B", async () => {
    const vista = await getPlanMemory(ctxA, planoDeB);

    // Nem a memória, nem as notas: o predicado de workspace corta antes.
    expect(vista.memory).toBeNull();
    expect(vista.ratings.every((r) => r.rating === null)).toBe(true);
  });

  it("A não cria nem altera avaliação em plano de B", async () => {
    await expect(setMemoryRating(ctxA, planoDeB, 1)).rejects.toThrow();
    await expect(
      saveMemoryText(ctxA, planoDeB, { highlight: "invasão", notes: null }),
    ).rejects.toThrow();
  });

  it("A não apaga a avaliação de B", async () => {
    await expect(clearMemoryRating(ctxA, planoDeB)).rejects.toThrow();

    const depois = await getPlanMemory(ctxB1, planoDeB);
    expect(
      depois.ratings.find((r) => r.profileId === PROFILE_B1)?.rating,
    ).toBe(5);
    expect(depois.memory?.highlight).toBe("Segredo do B");
  });
});

/**
 * A armadilha do bloco, medida.
 *
 * Com oito planos, uma timeline que consulta por linha responde igual a uma que
 * consulta em bloco — nada ficaria vermelho, nunca. Sessenta planos separam as
 * duas: por linha seriam mais de cento e vinte consultas.
 */
describe("o número de consultas é constante em relação ao número de planos", () => {
  const EM_ESCALA = 60;
  const criados: string[] = [];

  /** Conta as idas ao banco de uma leitura, instrumentando o pool do drizzle. */
  async function contarConsultas<T>(
    executar: () => Promise<T>,
  ): Promise<{ consultas: number; resultado: T }> {
    const pool = database.$client as { query: (...args: never[]) => unknown };
    const original = pool.query.bind(pool);

    let consultas = 0;
    pool.query = ((...args: never[]) => {
      consultas += 1;
      return original(...args);
    }) as typeof pool.query;

    try {
      const resultado = await executar();
      return { consultas, resultado };
    } finally {
      pool.query = original as typeof pool.query;
    }
  }

  beforeAll(async () => {
    /* Fixture em escala inserida direto, em duas instruções: passar sessenta
       planos pelo caminho do produto seriam duzentas e quarenta transações de
       ida e volta, e o que se quer medir é a leitura. Criado e removido por
       este teste, sem tocar no seed. */
    const planos = Array.from({ length: EM_ESCALA }, (_, i) => ({
      id: crypto.randomUUID(),
      workspaceId: WORKSPACE_B,
      title: `Date em escala ${i + 1}`,
      category: "outro",
      status: "completed" as const,
      createdBy: PROFILE_B1,
    }));

    await database.insert(schema.plans).values(planos);
    await database.insert(schema.planDateOptions).values(
      planos.map((plano, i) => ({
        workspaceId: WORKSPACE_B,
        planId: plano.id,
        // Dias distintos e no passado, espalhados por vários meses.
        startsAt: asHoras(addCivilDays(ONTEM, -i), 20),
        isConfirmed: true,
        createdBy: PROFILE_B1,
      })),
    );

    criados.push(...planos.map((plano) => plano.id));
  });

  afterAll(async () => {
    await database
      .delete(schema.plans)
      .where(inArray(schema.plans.id, criados));
  });

  it("a fixture em escala existe mesmo", async () => {
    const [linha] = await database
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.plans)
      .where(
        and(
          eq(schema.plans.workspaceId, WORKSPACE_B),
          eq(schema.plans.status, "completed"),
        ),
      );

    expect(Number(linha?.total)).toBeGreaterThanOrEqual(EM_ESCALA);
  });

  it("a timeline consulta o mesmo com um plano e com sessenta", async () => {
    /* Uma página inteira contra um único item. O parâmetro da leitura é o
       tamanho da página, e o que se mede é se o número de consultas depende de
       quantas linhas voltaram. */
    const cheia = await contarConsultas(() => listMemoryTimeline(ctxB1, 1));
    expect(cheia.resultado.items.length).toBe(MEMORIES_PER_PAGE);

    /* A última página tem uma linha só — sessenta e tantos planos em páginas de
       vinte e quatro. Se a consulta fosse por linha, aqui o número cairia. */
    const ultima = await contarConsultas(() =>
      listMemoryTimeline(ctxB1, Math.ceil((EM_ESCALA + 5) / MEMORIES_PER_PAGE)),
    );
    expect(ultima.resultado.items.length).toBeGreaterThan(0);
    expect(ultima.resultado.items.length).toBeLessThan(MEMORIES_PER_PAGE);

    expect(cheia.consultas).toBe(ultima.consultas);
    expect(cheia.consultas).toBe(4);
  });

  it("o detalhe do plano realizado também", async () => {
    const semAvaliacao = criados[0]!;
    const comAvaliacao = criados[1]!;
    await setMemoryRating(ctxB1, comAvaliacao, 4);
    await setMemoryRating(ctxB2, comAvaliacao, 5);

    const vazio = await contarConsultas(() =>
      getPlanMemory(ctxB1, semAvaliacao),
    );
    const cheio = await contarConsultas(() =>
      getPlanMemory(ctxB1, comAvaliacao),
    );

    // Sem memória, a consulta das notas nem acontece. Com duas notas, uma só.
    expect(vazio.consultas).toBe(2);
    expect(cheio.consultas).toBe(3);
    expect(cheio.resultado.averageTenths).toBe(45);
  });

  it("a paginação cobre a lista inteira sem repetir nem perder plano", async () => {
    const vistos: string[] = [];

    for (let pagina = 1; pagina <= 10; pagina += 1) {
      const atual = await listMemoryTimeline(ctxB1, pagina);
      vistos.push(...atual.items.map((item) => item.planId));
      if (!atual.hasNext) break;
    }

    const emEscala = vistos.filter((id) => criados.includes(id));
    expect(new Set(emEscala).size).toBe(emEscala.length);
    expect(new Set(emEscala).size).toBe(EM_ESCALA);
  });

  it("página além do fim devolve lista vazia, não erro", async () => {
    const longe = await listMemoryTimeline(ctxB1, 9_999_999);

    expect(longe.items).toEqual([]);
    expect(longe.hasNext).toBe(false);
    expect(longe.hasPrevious).toBe(true);
  });
});
