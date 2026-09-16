import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema/index.ts";
import {
  confirmDateOption,
  createDateOption,
  unconfirmDateOption,
} from "@/features/dates/data/mutations";
import {
  addChecklistItem,
  addExpense,
  deleteChecklistItem,
  deleteExpense,
  moveChecklistItem,
  saveReservationDetails,
  setReservationStatus,
  toggleChecklistItem,
} from "@/features/planning/data/mutations";
import {
  getReservation,
  listChecklist,
  listExpenses,
  readPlanFacts,
  totalCents,
} from "@/features/planning/data/queries";
import {
  changePlanStatus,
  createPlan,
  updatePlan,
} from "@/features/plans/data/mutations";
import { getPlan } from "@/features/plans/data/queries";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { startOfDayInApp } from "@/lib/datetime";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { MAX_CENTS } from "@/lib/money";
import {
  NO_CONFIRMED_RESERVATION,
  RESERVATION_HOLDS_PLAN,
} from "@/lib/plan-preconditions";

/**
 * Reserva, checklist e gastos contra o banco.
 *
 * Tudo acontece no workspace B, criado e removido aqui. Nenhum plano é criado
 * no workspace A: o `database.integration.test.ts` afirma que ele tem
 * exatamente os oito ids do seed (D-082).
 */
const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_B = "88888888-8888-4888-8888-888888888888";
const PROFILE_A = "seed_profile_alex";
const PROFILE_B1 = "seed_profile_planning_b1";
const PROFILE_B2 = "seed_profile_planning_b2";

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

const DIA = startOfDayInApp({ year: 2027, month: 6, day: 12 });

/** Cria um plano do B já em `planned`, com data confirmada. */
async function planoPlanejado(titulo: string): Promise<string> {
  const plano = await createPlan(ctxB1, { title: titulo, category: "outro" });
  await updatePlan(ctxB1, plano.id, { requiresBooking: true });
  const opcao = await createDateOption(ctxB1, plano.id, { startsAt: DIA });
  await confirmDateOption(ctxB1, opcao.id);
  return plano.id;
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

beforeAll(async () => {
  if (process.env.NEON_BRANCH !== "development") {
    throw new Error("ABORTADO: test:db exige NEON_BRANCH=development.");
  }

  databaseModule = await import("@/db/client.ts");
  database = databaseModule.db;

  await database
    .insert(schema.workspaces)
    .values({ id: WORKSPACE_B, name: "Workspace de planejamento B" })
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

describe("nada atravessa o workspace", () => {
  let planoDeB = "";
  let itemDeB = "";
  let gastoDeB = "";

  beforeAll(async () => {
    planoDeB = await planoPlanejado("Plano de planejamento do B");

    await saveReservationDetails(ctxB1, planoDeB, { code: "XYZ123" });
    await addChecklistItem(ctxB1, planoDeB, "Levar casaco");
    await addExpense(ctxB1, planoDeB, {
      label: "Ingressos",
      amountCents: 4500,
    });

    itemDeB = (await listChecklist(ctxB1, planoDeB))[0]!.id;
    gastoDeB = (await listExpenses(ctxB1, planoDeB))[0]!.id;
  });

  it("o A não lê a reserva, o item nem o gasto do B", async () => {
    expect(await getReservation(ctxA, planoDeB)).toBeNull();
    expect(await listChecklist(ctxA, planoDeB)).toHaveLength(0);
    expect(await listExpenses(ctxA, planoDeB)).toHaveLength(0);
  });

  it("o A não cria reserva, item nem gasto no plano do B", async () => {
    await expect(
      saveReservationDetails(ctxA, planoDeB, { code: "INVASOR" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      addChecklistItem(ctxA, planoDeB, "Item do invasor"),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      addExpense(ctxA, planoDeB, { label: "Invasor", amountCents: 100 }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect((await getReservation(ctxB1, planoDeB))!.code).toBe("XYZ123");
    expect(await listChecklist(ctxB1, planoDeB)).toHaveLength(1);
    expect(await listExpenses(ctxB1, planoDeB)).toHaveLength(1);
  });

  it("o A não marca, não move e não apaga item do B", async () => {
    await expect(
      toggleChecklistItem(ctxA, itemDeB, true),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      moveChecklistItem(ctxA, itemDeB, "down"),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(deleteChecklistItem(ctxA, itemDeB)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const item = (await listChecklist(ctxB1, planoDeB))[0]!;
    expect(item.doneAt).toBeNull();
  });

  it("o A não apaga gasto do B", async () => {
    await expect(deleteExpense(ctxA, gastoDeB)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    expect(await listExpenses(ctxB1, planoDeB)).toHaveLength(1);
  });

  it("o A não muda o estado da reserva do B", async () => {
    await expect(
      setReservationStatus(ctxA, planoDeB, "confirmed"),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect((await getReservation(ctxB1, planoDeB))!.status).toBe("pending");
  });
});

describe("a máquina de status, nos dois sentidos", () => {
  let plano = "";

  beforeEach(async () => {
    plano = await planoPlanejado("Plano da máquina");
  });

  it("planned → reserved manual sem reserva confirmada é recusado", async () => {
    await expect(
      changePlanStatus(ctxB1, plano, "reserved"),
    ).rejects.toThrowError(NO_CONFIRMED_RESERVATION);

    expect(await statusDoPlano(plano)).toBe("planned");
  });

  it("confirmar a reserva move para reserved e emite evento", async () => {
    const antes = await contarEventos(plano);

    await setReservationStatus(ctxB1, plano, "confirmed");

    expect(await statusDoPlano(plano)).toBe("reserved");
    expect(await contarEventos(plano)).toBe(antes + 1);

    const [evento] = await database
      .select({ verb: schema.activityEvents.verb })
      .from(schema.activityEvents)
      .where(eq(schema.activityEvents.subjectId, plano))
      .orderBy(sql`created_at desc`)
      .limit(1);

    expect(evento!.verb).toBe("booking_updated");
  });

  it("desfazer a reserva devolve o plano a planned", async () => {
    await setReservationStatus(ctxB1, plano, "confirmed");
    expect(await statusDoPlano(plano)).toBe("reserved");

    await setReservationStatus(ctxB1, plano, "pending");
    expect(await statusDoPlano(plano)).toBe("planned");

    await setReservationStatus(ctxB1, plano, "confirmed");
    await setReservationStatus(ctxB1, plano, "cancelled");
    expect(await statusDoPlano(plano)).toBe("planned");
  });

  it("reserved → planned manual com reserva confirmada é recusado", async () => {
    await setReservationStatus(ctxB1, plano, "confirmed");

    await expect(
      changePlanStatus(ctxB1, plano, "planned"),
    ).rejects.toThrowError(RESERVATION_HOLDS_PLAN);

    expect(await statusDoPlano(plano)).toBe("reserved");
  });

  it("a interface não oferece o botão que seria recusado", async () => {
    await setReservationStatus(ctxB1, plano, "confirmed");

    const facts = await readPlanFacts(ctxB1, plano);
    expect(facts.hasConfirmedReservation).toBe(true);
    expect(facts.hasConfirmedDate).toBe(true);
  });
});

describe("o caminho do B6, refeito de fora para dentro", () => {
  it("desfaz reserva, volta a planned, desmarca data, volta a deciding", async () => {
    const plano = await planoPlanejado("Plano do caminho completo");
    await setReservationStatus(ctxB1, plano, "confirmed");
    expect(await statusDoPlano(plano)).toBe("reserved");

    // Na ordem errada, a mensagem nova aparece.
    await expect(unconfirmDateOption(ctxB1, plano)).rejects.toThrowError(
      RESERVATION_HOLDS_PLAN,
    );

    // Na ordem certa: de fora para dentro.
    await setReservationStatus(ctxB1, plano, "cancelled");
    expect(await statusDoPlano(plano)).toBe("planned");

    await unconfirmDateOption(ctxB1, plano);
    expect(await statusDoPlano(plano)).toBe("deciding");
  });
});

describe("checklist", () => {
  let plano = "";

  beforeEach(async () => {
    plano = await planoPlanejado("Plano do checklist");
  });

  it("marcar grava autor e horário juntos; desmarcar apaga os dois", async () => {
    await addChecklistItem(ctxB1, plano, "Levar guarda-chuva");
    const item = (await listChecklist(ctxB1, plano))[0]!;

    await toggleChecklistItem(ctxB2, item.id, true);
    const marcado = (await listChecklist(ctxB1, plano))[0]!;

    expect(marcado.doneBy).toBe(PROFILE_B2);
    expect(marcado.doneAt).toBeInstanceOf(Date);
    expect(marcado.doneByName).toBe("Caio");

    await toggleChecklistItem(ctxB1, item.id, false);
    const desmarcado = (await listChecklist(ctxB1, plano))[0]!;

    expect(desmarcado.doneBy).toBeNull();
    expect(desmarcado.doneAt).toBeNull();
  });

  it("qualquer membro marca o item que o outro criou", async () => {
    await addChecklistItem(ctxB1, plano, "Item da Bruna");
    const item = (await listChecklist(ctxB2, plano))[0]!;

    await toggleChecklistItem(ctxB2, item.id, true);
    expect((await listChecklist(ctxB1, plano))[0]!.doneBy).toBe(PROFILE_B2);
  });

  it("done_by sem done_at é recusado direto no banco", async () => {
    await addChecklistItem(ctxB1, plano, "Item do CHECK");
    const item = (await listChecklist(ctxB1, plano))[0]!;

    /* Burlando a camada de dados de propósito: a garantia é do banco, não da
       aplicação (D-065), e um teste que só exercitasse a camada de dados não
       provaria isso. */
    await expect(
      database
        .update(schema.checklistItems)
        .set({ doneBy: PROFILE_B1, doneAt: null })
        .where(eq(schema.checklistItems.id, item.id)),
    ).rejects.toThrow();

    await expect(
      database
        .update(schema.checklistItems)
        .set({ doneBy: null, doneAt: new Date() })
        .where(eq(schema.checklistItems.id, item.id)),
    ).rejects.toThrow();
  });

  it("as setas trocam a posição com o vizinho", async () => {
    for (const texto of ["Primeiro", "Segundo", "Terceiro"]) {
      await addChecklistItem(ctxB1, plano, texto);
    }

    const rotulos = async () =>
      (await listChecklist(ctxB1, plano)).map((i) => i.label);

    expect(await rotulos()).toEqual(["Primeiro", "Segundo", "Terceiro"]);

    const segundo = (await listChecklist(ctxB1, plano))[1]!;
    await moveChecklistItem(ctxB1, segundo.id, "up");
    expect(await rotulos()).toEqual(["Segundo", "Primeiro", "Terceiro"]);

    await moveChecklistItem(ctxB1, segundo.id, "down");
    expect(await rotulos()).toEqual(["Primeiro", "Segundo", "Terceiro"]);
  });

  it("subir o primeiro e descer o último não é erro nem mexe em nada", async () => {
    await addChecklistItem(ctxB1, plano, "Único");
    const item = (await listChecklist(ctxB1, plano))[0]!;

    await moveChecklistItem(ctxB1, item.id, "up");
    await moveChecklistItem(ctxB1, item.id, "down");

    expect(await listChecklist(ctxB1, plano)).toHaveLength(1);
  });

  it("apagar tira da lista", async () => {
    await addChecklistItem(ctxB1, plano, "Some daqui");
    const item = (await listChecklist(ctxB1, plano))[0]!;

    await deleteChecklistItem(ctxB1, item.id);
    expect(await listChecklist(ctxB1, plano)).toHaveLength(0);
  });

  it("item vazio é recusado", async () => {
    await expect(addChecklistItem(ctxB1, plano, "   ")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("gastos", () => {
  let plano = "";

  beforeEach(async () => {
    plano = await planoPlanejado("Plano dos gastos");
  });

  it("três gastos de dez centavos somam exatamente trinta", async () => {
    for (const label of ["Café", "Pão", "Água"]) {
      await addExpense(ctxB1, plano, { label, amountCents: 10 });
    }

    expect(totalCents(await listExpenses(ctxB1, plano))).toBe(30);
  });

  it("uma lista longa bate com a soma feita à mão", async () => {
    let esperado = 0;
    for (let i = 1; i <= 20; i += 1) {
      const valor = i * 137;
      esperado += valor;
      await addExpense(ctxB1, plano, {
        label: `Gasto ${i}`,
        amountCents: valor,
      });
    }

    expect(totalCents(await listExpenses(ctxB1, plano))).toBe(esperado);
    // 137 × (1+2+…+20) = 137 × 210
    expect(esperado).toBe(137 * 210);
  });

  it("quem pagou é registrado, e é opcional", async () => {
    await addExpense(ctxB1, plano, {
      label: "Táxi",
      amountCents: 3200,
      paidBy: PROFILE_B2,
    });
    await addExpense(ctxB1, plano, { label: "Gorjeta", amountCents: 500 });

    const gastos = await listExpenses(ctxB1, plano);
    const taxi = gastos.find((g) => g.label === "Táxi")!;
    const gorjeta = gastos.find((g) => g.label === "Gorjeta")!;

    expect(taxi.paidBy).toBe(PROFILE_B2);
    expect(taxi.paidByName).toBe("Caio");
    expect(gorjeta.paidBy).toBeNull();
    expect(gorjeta.paidByName).toBeNull();
  });

  it("quem pagou precisa ser membro do workspace do plano", async () => {
    await expect(
      addExpense(ctxB1, plano, {
        label: "Tentativa cruzada",
        amountCents: 100,
        paidBy: PROFILE_A,
      }),
    ).rejects.toThrowError("Escolha uma pessoa deste DATE.");

    expect(await listExpenses(ctxB1, plano)).toHaveLength(0);
  });

  it("valor negativo é recusado pela camada de dados, antes do banco", async () => {
    await expect(
      addExpense(ctxB1, plano, { label: "Estorno", amountCents: -100 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("o CHECK do banco recusa negativo mesmo burlando a camada", async () => {
    await expect(
      database.insert(schema.expenses).values({
        workspaceId: WORKSPACE_B,
        planId: plano,
        label: "Direto no banco",
        amountCents: -1,
      }),
    ).rejects.toThrow();
  });

  it("o teto do integer é respeitado", async () => {
    await addExpense(ctxB1, plano, {
      label: "No teto",
      amountCents: MAX_CENTS,
    });
    expect(totalCents(await listExpenses(ctxB1, plano))).toBe(MAX_CENTS);
  });

  it("acima do teto é recusado pela aplicação, não pelo banco", async () => {
    await expect(
      addExpense(ctxB1, plano, {
        label: "Passou do teto",
        amountCents: MAX_CENTS + 1,
      }),
    ).rejects.toThrowError(/O valor máximo é/);

    expect(await listExpenses(ctxB1, plano)).toHaveLength(0);
  });

  it("apagar tira da lista e do total", async () => {
    await addExpense(ctxB1, plano, { label: "Some", amountCents: 999 });
    const gasto = (await listExpenses(ctxB1, plano))[0]!;

    await deleteExpense(ctxB1, gasto.id);
    expect(totalCents(await listExpenses(ctxB1, plano))).toBe(0);
  });
});

describe("checklist e gasto não entram no feed (seção 7)", () => {
  it("uma sessão de uso inteira não acrescenta evento nenhum", async () => {
    const plano = await planoPlanejado("Plano do feed");
    const antes = await contarEventos(plano);

    await addChecklistItem(ctxB1, plano, "Um");
    await addChecklistItem(ctxB1, plano, "Dois");
    const itens = await listChecklist(ctxB1, plano);
    await toggleChecklistItem(ctxB2, itens[0]!.id, true);
    await toggleChecklistItem(ctxB1, itens[1]!.id, true);
    await moveChecklistItem(ctxB1, itens[1]!.id, "up");
    await deleteChecklistItem(ctxB1, itens[0]!.id);

    await addExpense(ctxB1, plano, { label: "Jantar", amountCents: 12000 });
    const gastos = await listExpenses(ctxB1, plano);
    await deleteExpense(ctxB1, gastos[0]!.id);

    expect(await contarEventos(plano)).toBe(antes);

    // E a reserva, que entra, continua entrando.
    await setReservationStatus(ctxB1, plano, "confirmed");
    expect(await contarEventos(plano)).toBe(antes + 1);
  });
});

describe("disponibilidade por status (seção 8)", () => {
  it("reserva exige data confirmada", async () => {
    const plano = await createPlan(ctxB1, {
      title: "Sem data ainda",
      category: "outro",
    });
    await updatePlan(ctxB1, plano.id, { requiresBooking: true });

    await expect(
      setReservationStatus(ctxB1, plano.id, "confirmed"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("reserva exige que o plano esteja marcado como precisando dela", async () => {
    const plano = await createPlan(ctxB1, {
      title: "Data sem necessidade de reserva",
      category: "outro",
    });
    const opcao = await createDateOption(ctxB1, plano.id, { startsAt: DIA });
    await confirmDateOption(ctxB1, opcao.id);

    await expect(
      setReservationStatus(ctxB1, plano.id, "confirmed"),
    ).rejects.toThrowError(/Marque que o plano precisa de reserva/);
  });

  it("não esconde uma reserva confirmada ao desmarcar a necessidade", async () => {
    const plano = await planoPlanejado("Reserva não pode ser escondida");
    await setReservationStatus(ctxB1, plano, "confirmed");

    await expect(
      updatePlan(ctxB1, plano, { requiresBooking: false }),
    ).rejects.toThrowError(/Desfaça a reserva/);

    expect((await getPlan(ctxB1, plano)).requiresBooking).toBe(true);

    await setReservationStatus(ctxB1, plano, "pending");
    await updatePlan(ctxB1, plano, { requiresBooking: false });
    expect((await getPlan(ctxB1, plano)).requiresBooking).toBe(false);
  });

  it("checklist e gasto não exigem nada", async () => {
    const plano = await createPlan(ctxB1, {
      title: "Ideia solta",
      category: "outro",
    });

    await addChecklistItem(ctxB1, plano.id, "Pensar melhor");
    await addExpense(ctxB1, plano.id, { label: "Sinal", amountCents: 5000 });

    expect(await listChecklist(ctxB1, plano.id)).toHaveLength(1);
    expect(await listExpenses(ctxB1, plano.id)).toHaveLength(1);
  });

  it("plano cancelado é leitura nas três", async () => {
    const plano = await planoPlanejado("Vai ser cancelado");
    await addChecklistItem(ctxB1, plano, "Item de antes");
    await changePlanStatus(ctxB1, plano, "cancelled");

    await expect(
      addChecklistItem(ctxB1, plano, "Item de depois"),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      addExpense(ctxB1, plano, { label: "Depois", amountCents: 100 }),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      setReservationStatus(ctxB1, plano, "confirmed"),
    ).rejects.toBeInstanceOf(ValidationError);

    // Mas a leitura continua.
    expect(await listChecklist(ctxB1, plano)).toHaveLength(1);
  });

  it("plano arquivado é leitura nas três", async () => {
    const plano = await planoPlanejado("Vai ser arquivado");
    await database
      .update(schema.plans)
      .set({ archivedAt: new Date() })
      .where(eq(schema.plans.id, plano));

    await expect(
      addChecklistItem(ctxB1, plano, "Não entra"),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("uma reserva por plano", () => {
  it("o banco recusa a segunda, mesmo burlando a camada", async () => {
    const plano = await planoPlanejado("Plano de uma reserva só");
    await saveReservationDetails(ctxB1, plano, { code: "PRIMEIRA" });

    await expect(
      database.insert(schema.reservations).values({
        workspaceId: WORKSPACE_B,
        planId: plano,
        createdBy: PROFILE_B1,
      }),
    ).rejects.toThrow();
  });

  it("salvar de novo edita em vez de duplicar", async () => {
    const plano = await planoPlanejado("Plano de edição");

    await saveReservationDetails(ctxB1, plano, { code: "A1" });
    await saveReservationDetails(ctxB1, plano, {
      code: "B2",
      reservedTime: "20:30",
      notes: "Mesa na janela",
    });

    const reserva = await getReservation(ctxB1, plano);
    expect(reserva!.code).toBe("B2");
    expect(reserva!.reservedTime).toBe("20:30:00");
    expect(reserva!.notes).toBe("Mesa na janela");

    const [contagem] = await database
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.reservations)
      .where(
        and(
          eq(schema.reservations.workspaceId, WORKSPACE_B),
          eq(schema.reservations.planId, plano),
        ),
      );

    expect(contagem!.total).toBe(1);
  });
});
