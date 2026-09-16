import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema/index.ts";
import {
  castVote,
  clearVote,
  confirmDateOption,
  createDateOption,
  deleteDateOption,
  unconfirmDateOption,
} from "@/features/dates/data/mutations";
import {
  getConfirmedOption,
  getNextConfirmedDate,
  listPlanDateOptions,
} from "@/features/dates/data/queries";
import { setReservationStatus } from "@/features/planning/data/mutations";
import {
  changePlanStatus,
  createPlan,
  updatePlan,
} from "@/features/plans/data/mutations";
import { getPlan } from "@/features/plans/data/queries";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { startOfDayInApp } from "@/lib/datetime";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { MAX_OPTIONS_PER_PLAN } from "@/features/dates/constants";

/**
 * Dois workspaces, agora para datas e votos, mais os invariantes da
 * confirmação — que são o que este bloco tem de mais delicado.
 *
 * Tudo acontece no workspace B, criado e removido aqui, exceto os testes que
 * precisam do contexto de A para provar que ele não alcança nada. Nenhum plano
 * é criado no workspace A: o `database.integration.test.ts` afirma que ele tem
 * exatamente os oito ids do seed.
 */
const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_B = "66666666-6666-4666-8666-666666666666";
const PROFILE_A = "seed_profile_alex";
const PROFILE_B1 = "seed_profile_dates_b1";
const PROFILE_B2 = "seed_profile_dates_b2";

type DatabaseModule = typeof import("@/db/client.ts");
let databaseModule: DatabaseModule | undefined;
let database: DatabaseModule["db"];

const ctxA: AuthorizedContext = {
  userId: PROFILE_A,
  profileId: PROFILE_A,
  workspaceId: WORKSPACE_A,
  role: "owner",
};

/** As duas pessoas do workspace B, para o consenso ter dois votos de verdade. */
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

const DIA = (day: number) => startOfDayInApp({ year: 2027, month: 3, day });

async function novoPlano(titulo: string): Promise<string> {
  const plano = await createPlan(ctxB1, { title: titulo, category: "outro" });
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
    .values({ id: WORKSPACE_B, name: "Workspace de datas B" })
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

describe("datas não atravessam o workspace", () => {
  let planoDeB = "";
  let opcaoDeB = "";

  beforeAll(async () => {
    planoDeB = await novoPlano("Plano com datas do B");
    opcaoDeB = (await createDateOption(ctxB1, planoDeB, { startsAt: DIA(10) }))
      .id;
  });

  it("listPlanDateOptions do A não devolve opção do B", async () => {
    expect(await listPlanDateOptions(ctxA, planoDeB)).toHaveLength(0);
  });

  it("createDateOption do A não cria no plano do B", async () => {
    await expect(
      createDateOption(ctxA, planoDeB, { startsAt: DIA(11) }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await listPlanDateOptions(ctxB1, planoDeB)).toHaveLength(1);
  });

  it("castVote do A não vota na opção do B", async () => {
    await expect(castVote(ctxA, opcaoDeB, "yes")).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const [opcao] = await listPlanDateOptions(ctxB1, planoDeB);
    expect(opcao!.votes.every((v) => v.vote === null)).toBe(true);
  });

  it("confirmDateOption do A não confirma a opção do B", async () => {
    await expect(confirmDateOption(ctxA, opcaoDeB)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    expect(await getConfirmedOption(ctxB1, planoDeB)).toBeNull();
  });

  it("deleteDateOption do A não apaga a opção do B", async () => {
    await expect(deleteDateOption(ctxA, opcaoDeB)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    expect(await listPlanDateOptions(ctxB1, planoDeB)).toHaveLength(1);
  });

  it("unconfirmDateOption do A não mexe no plano do B", async () => {
    await expect(unconfirmDateOption(ctxA, planoDeB)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("getNextConfirmedDate do A não enxerga data confirmada do B", async () => {
    await confirmDateOption(ctxB1, opcaoDeB);

    const doB = await getNextConfirmedDate(ctxB1, DIA(1));
    expect(doB?.planId).toBe(planoDeB);

    const doA = await getNextConfirmedDate(ctxA, DIA(1));
    expect(doA?.planId).not.toBe(planoDeB);
  });

  it("clearVote do A não apaga voto do B", async () => {
    await castVote(ctxB1, opcaoDeB, "yes");
    await clearVote(ctxA, opcaoDeB);

    const [opcao] = await listPlanDateOptions(ctxB1, planoDeB);
    expect(opcao!.votes.find((v) => v.profileId === PROFILE_B1)?.vote).toBe(
      "yes",
    );
  });
});

describe("nunca existem duas datas confirmadas", () => {
  it("confirmar a segunda desmarca a primeira, e o banco impede o resto", async () => {
    const plano = await novoPlano("Plano de duas confirmações");
    const primeira = await createDateOption(ctxB1, plano, {
      startsAt: DIA(12),
    });
    const segunda = await createDateOption(ctxB1, plano, { startsAt: DIA(13) });

    await confirmDateOption(ctxB1, primeira.id);
    expect((await getConfirmedOption(ctxB1, plano))?.id).toBe(primeira.id);

    await confirmDateOption(ctxB1, segunda.id);
    expect((await getConfirmedOption(ctxB1, plano))?.id).toBe(segunda.id);

    const confirmadas = await database
      .select({ id: schema.planDateOptions.id })
      .from(schema.planDateOptions)
      .where(
        and(
          eq(schema.planDateOptions.planId, plano),
          eq(schema.planDateOptions.isConfirmed, true),
        ),
      );
    expect(confirmadas).toHaveLength(1);
  });

  it("burlar a camada de dados e marcar as duas direto no banco é recusado", async () => {
    const plano = await novoPlano("Plano de burla");
    const primeira = await createDateOption(ctxB1, plano, {
      startsAt: DIA(14),
    });
    const segunda = await createDateOption(ctxB1, plano, { startsAt: DIA(15) });

    await confirmDateOption(ctxB1, primeira.id);

    /* O único parcial de is_confirmed é invariante de correção e vive no banco
       (D-065): nem um UPDATE direto consegue deixar duas confirmadas. */
    await expect(
      database
        .update(schema.planDateOptions)
        .set({ isConfirmed: true })
        .where(eq(schema.planDateOptions.id, segunda.id)),
    ).rejects.toThrow();

    expect((await getConfirmedOption(ctxB1, plano))?.id).toBe(primeira.id);
  });
});

describe("acoplamento com a máquina de status", () => {
  it("a primeira opção move idea para deciding, e a segunda não move nada", async () => {
    const plano = await novoPlano("Plano que começa como ideia");
    expect((await getPlan(ctxB1, plano)).status).toBe("idea");

    await createDateOption(ctxB1, plano, { startsAt: DIA(16) });
    expect((await getPlan(ctxB1, plano)).status).toBe("deciding");

    await createDateOption(ctxB1, plano, { startsAt: DIA(17) });
    expect((await getPlan(ctxB1, plano)).status).toBe("deciding");
  });

  it("confirmar move deciding para planned e desconfirmar volta", async () => {
    const plano = await novoPlano("Plano de ida e volta");
    const opcao = await createDateOption(ctxB1, plano, { startsAt: DIA(18) });

    await confirmDateOption(ctxB1, opcao.id);
    expect((await getPlan(ctxB1, plano)).status).toBe("planned");

    await unconfirmDateOption(ctxB1, plano);
    expect((await getPlan(ctxB1, plano)).status).toBe("deciding");
    expect(await getConfirmedOption(ctxB1, plano)).toBeNull();
  });

  /**
   * Este teste mudou no B8, e a mudança é da regra, não do teste.
   *
   * A versão do B6 montava o estado `reserved` chamando `changePlanStatus` e
   * voltava chamando de novo — os dois caminhos que a pré-condição nova recusa.
   * `reserved` agora afirma que existe reserva confirmada, e quem põe e tira
   * essa etiqueta é a reserva.
   *
   * A ordem passou a ser de fora para dentro: desfaz a reserva, o plano volta a
   * `planned` sozinho, e só então a data se desmarca.
   */
  it("desconfirmar a partir de reserved é recusado", async () => {
    const plano = await novoPlano("Plano com reserva");
    const opcao = await createDateOption(ctxB1, plano, { startsAt: DIA(19) });

    await confirmDateOption(ctxB1, opcao.id);

    // O estado reserved vem da reserva, não do botão de status.
    await updatePlan(ctxB1, plano, { requiresBooking: true });
    await setReservationStatus(ctxB1, plano, "confirmed");
    expect((await getPlan(ctxB1, plano)).status).toBe("reserved");

    await expect(unconfirmDateOption(ctxB1, plano)).rejects.toBeInstanceOf(
      ValidationError,
    );

    // A data continua confirmada e o status continua reserved.
    expect((await getConfirmedOption(ctxB1, plano))?.id).toBe(opcao.id);
    expect((await getPlan(ctxB1, plano)).status).toBe("reserved");

    // E voltar por status também é recusado: quem desfaz reserva é a reserva.
    await expect(
      changePlanStatus(ctxB1, plano, "planned"),
    ).rejects.toBeInstanceOf(ValidationError);

    // De fora para dentro, aí sim.
    await setReservationStatus(ctxB1, plano, "cancelled");
    expect((await getPlan(ctxB1, plano)).status).toBe("planned");

    await unconfirmDateOption(ctxB1, plano);
    expect((await getPlan(ctxB1, plano)).status).toBe("deciding");
  });

  it("deciding para planned manual sem data confirmada é recusado", async () => {
    const plano = await novoPlano("Plano sem data confirmada");
    await createDateOption(ctxB1, plano, { startsAt: DIA(20) });
    expect((await getPlan(ctxB1, plano)).status).toBe("deciding");

    await expect(
      changePlanStatus(ctxB1, plano, "planned"),
    ).rejects.toBeInstanceOf(ValidationError);

    expect((await getPlan(ctxB1, plano)).status).toBe("deciding");
  });

  it("com data confirmada, planned manual passa", async () => {
    const plano = await novoPlano("Plano que pode ir a planned");
    const opcao = await createDateOption(ctxB1, plano, { startsAt: DIA(21) });

    await confirmDateOption(ctxB1, opcao.id);
    await unconfirmDateOption(ctxB1, plano);
    await confirmDateOption(ctxB1, opcao.id);

    expect((await getPlan(ctxB1, plano)).status).toBe("planned");
  });

  it("plano cancelado não recebe data confirmada", async () => {
    const plano = await novoPlano("Plano cancelado");
    const opcao = await createDateOption(ctxB1, plano, { startsAt: DIA(22) });
    await changePlanStatus(ctxB1, plano, "cancelled");

    await expect(confirmDateOption(ctxB1, opcao.id)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("eventos de toda transição", () => {
  it("sugerir, votar e confirmar deixam rastro com os verbos certos", async () => {
    const plano = await novoPlano("Plano com eventos");

    const opcao = await createDateOption(ctxB1, plano, { startsAt: DIA(23) });
    await castVote(ctxB1, opcao.id, "yes");
    await castVote(ctxB2, opcao.id, "yes");
    await confirmDateOption(ctxB1, opcao.id);

    /* Filtra pelo sujeito em vez de fatiar por contagem: `select` sem
       `order by` não garante ordem, e a primeira versão deste teste dependia
       de as linhas novas virem no fim. */
    const novos = await database
      .select({
        verb: schema.activityEvents.verb,
        subjectId: schema.activityEvents.subjectId,
      })
      .from(schema.activityEvents)
      .where(
        and(
          eq(schema.activityEvents.workspaceId, WORKSPACE_B),
          eq(schema.activityEvents.subjectId, opcao.id),
        ),
      );

    const verbos = novos.map((e) => e.verb);

    expect(verbos).toContain("date_suggested");
    expect(verbos.filter((v) => v === "vote_cast")).toHaveLength(2);
    expect(verbos).toContain("date_confirmed");
    expect(novos.every((e) => e.subjectId === opcao.id)).toBe(true);
  });
});

describe("regras da opção", () => {
  it("recusa a décima primeira data", async () => {
    const plano = await novoPlano("Plano cheio de datas");

    for (let i = 1; i <= MAX_OPTIONS_PER_PLAN; i += 1) {
      await createDateOption(ctxB1, plano, {
        startsAt: startOfDayInApp({ year: 2027, month: 5, day: i }),
      });
    }

    await expect(
      createDateOption(ctxB1, plano, {
        startsAt: startOfDayInApp({ year: 2027, month: 5, day: 20 }),
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await listPlanDateOptions(ctxB1, plano)).toHaveLength(
      MAX_OPTIONS_PER_PLAN,
    );
  });

  it("recusa data duplicada no mesmo plano", async () => {
    const plano = await novoPlano("Plano de data repetida");
    await createDateOption(ctxB1, plano, { startsAt: DIA(24) });

    await expect(
      createDateOption(ctxB1, plano, { startsAt: DIA(24) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("recusa fim anterior ao começo", async () => {
    const plano = await novoPlano("Plano de intervalo invertido");

    await expect(
      createDateOption(ctxB1, plano, {
        startsAt: DIA(25),
        endsAt: DIA(24),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("aceita data no passado, que é uso legítimo", async () => {
    const plano = await novoPlano("Plano de date que já rolou");

    const opcao = await createDateOption(ctxB1, plano, {
      startsAt: startOfDayInApp({ year: 2020, month: 1, day: 5 }),
    });

    expect(opcao.id).toBeTruthy();
  });

  it("apagar a data confirmada é recusado antes de desconfirmar", async () => {
    const plano = await novoPlano("Plano de apagar confirmada");
    const opcao = await createDateOption(ctxB1, plano, { startsAt: DIA(26) });
    await confirmDateOption(ctxB1, opcao.id);

    await expect(deleteDateOption(ctxB1, opcao.id)).rejects.toBeInstanceOf(
      ValidationError,
    );

    await unconfirmDateOption(ctxB1, plano);
    await deleteDateOption(ctxB1, opcao.id);
    expect(await listPlanDateOptions(ctxB1, plano)).toHaveLength(0);
  });
});

describe("votos e consenso vindos do banco", () => {
  it("os dois votos aparecem, e o consenso sai do par", async () => {
    const plano = await novoPlano("Plano de consenso");
    const opcao = await createDateOption(ctxB1, plano, { startsAt: DIA(27) });

    let [linha] = await listPlanDateOptions(ctxB1, plano);
    expect(linha!.consensus.state).toBe("untouched");

    await castVote(ctxB1, opcao.id, "yes");
    [linha] = await listPlanDateOptions(ctxB1, plano);
    expect(linha!.consensus.state).toBe("waiting");
    expect(linha!.consensus.waitingOn).toBe("Caio");

    await castVote(ctxB2, opcao.id, "maybe");
    [linha] = await listPlanDateOptions(ctxB1, plano);
    expect(linha!.consensus.state).toBe("leaning");

    await castVote(ctxB2, opcao.id, "yes");
    [linha] = await listPlanDateOptions(ctxB1, plano);
    expect(linha!.consensus.state).toBe("both_yes");

    await castVote(ctxB2, opcao.id, "no");
    [linha] = await listPlanDateOptions(ctxB1, plano);
    expect(linha!.consensus.state).toBe("blocked");
  });

  it("myVote é o de quem está olhando, não o do outro", async () => {
    const plano = await novoPlano("Plano de voto próprio");
    const opcao = await createDateOption(ctxB1, plano, { startsAt: DIA(28) });

    await castVote(ctxB1, opcao.id, "yes");
    await castVote(ctxB2, opcao.id, "no");

    const [comoB1] = await listPlanDateOptions(ctxB1, plano);
    const [comoB2] = await listPlanDateOptions(ctxB2, plano);

    expect(comoB1!.myVote).toBe("yes");
    expect(comoB2!.myVote).toBe("no");
  });

  it("retirar o voto volta a 'sem resposta', que não é votar não", async () => {
    const plano = await novoPlano("Plano de retirar voto");
    const opcao = await createDateOption(ctxB1, plano, { startsAt: DIA(29) });

    await castVote(ctxB1, opcao.id, "no");
    let [linha] = await listPlanDateOptions(ctxB1, plano);
    expect(linha!.consensus.state).toBe("blocked");

    await clearVote(ctxB1, opcao.id);
    [linha] = await listPlanDateOptions(ctxB1, plano);
    expect(linha!.myVote).toBeNull();
    expect(linha!.consensus.state).toBe("untouched");
  });
});

describe("a assinatura não deixa o caller escolher workspace", () => {
  it("as funções de data recebem contexto primeiro e só ids depois", () => {
    expect(listPlanDateOptions.length).toBe(2);
    expect(createDateOption.length).toBe(3);
    expect(castVote.length).toBe(3);
    expect(confirmDateOption.length).toBe(2);
    expect(deleteDateOption.length).toBe(2);
    expect(unconfirmDateOption.length).toBe(2);
  });
});
