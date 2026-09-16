import "server-only";

import { and, asc, desc, eq, max, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  activityEvents,
  checklistItems,
  expenses,
  plans,
  reservations,
  workspaceMembers,
} from "@/db/schema/index.ts";
import { enqueuePartnerIntent } from "@/features/notifications/data/outbox";
import { startNotificationWorkflows } from "@/features/notifications/workflow/start";
import {
  MAX_CHECKLIST_ITEMS,
  MAX_EXPENSES_PER_PLAN,
} from "@/features/planning/constants";
import { readPlanFacts } from "@/features/planning/data/queries";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { formatCents, MAX_CENTS } from "@/lib/money";
import { transitionBlock } from "@/lib/plan-preconditions";
import type { PlanStatus } from "@/lib/status";

/**
 * Escritas de reserva, checklist e gastos.
 *
 * A transição automática de status acontece na **mesma transação** da escrita
 * que a causou, e emite evento — simetria exata com o que o B6 fez com a
 * confirmação de data (D-063).
 *
 * Checklist e gasto **não** emitem evento: o feed do B10 é a história do plano,
 * não o log de edição. Quatro itens marcados num sábado à noite afogariam a
 * história inteira.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ReservationStatus = "pending" | "confirmed" | "cancelled";

type PlanoTravado = {
  id: string;
  status: PlanStatus;
  archivedAt: Date | null;
  requiresBooking: boolean;
};

/**
 * Trava o plano e devolve o estado atual. `FOR UPDATE` dentro da transação é a
 * exceção sancionada à proibição de ler-e-escrever (D-055): a janela entre a
 * checagem e a escrita é o bug, e a trava a elimina.
 */
async function lockPlan(
  tx: Tx,
  ctx: AuthorizedContext,
  planId: string,
): Promise<PlanoTravado> {
  const [plano] = await tx
    .select({
      id: plans.id,
      status: plans.status,
      archivedAt: plans.archivedAt,
      requiresBooking: plans.requiresBooking,
    })
    .from(plans)
    .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)))
    .for("update")
    .limit(1);

  if (!plano) {
    throw new NotFoundError("Plano");
  }

  return plano;
}

/** Plano cancelado ou arquivado é leitura nas três seções (seção 8). */
function assertWritable(plano: PlanoTravado): void {
  if (plano.archivedAt !== null) {
    throw new ValidationError(
      "Esse plano está arquivado. Desarquive para poder editar.",
    );
  }

  if (plano.status === "cancelled") {
    throw new ValidationError(
      "Esse plano está cancelado. Reative antes de editar.",
    );
  }
}

/**
 * O checklist fecha quando o date acontece (seção 3 do docs/MEMORIES.md).
 *
 * `completed` é terminal na transição e **não** na escrita — é por isso que
 * gasto continua editável ali, e é depois que se sabe quanto custou. O
 * checklist é a exceção declarada: "o que levar" perde a função no momento em
 * que as duas pessoas já foram, e marcar um item depois não afirma nada sobre
 * o mundo.
 */
function assertChecklistWritable(plano: PlanoTravado): void {
  assertWritable(plano);

  if (plano.status === "completed") {
    throw new ValidationError(
      "Esse date já aconteceu. O checklist fica só de leitura.",
    );
  }
}

/** Move o status do plano e emite o evento, na transação de quem chamou. */
async function moveStatus(
  tx: Tx,
  ctx: AuthorizedContext,
  planId: string,
  nextStatus: PlanStatus,
): Promise<void> {
  await tx
    .update(plans)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)));
}

/* ------------------------------------------------------------------ *
 * Reserva
 * ------------------------------------------------------------------ */

export type ReservationInput = {
  code?: string | null;
  reservedTime?: string | null;
  url?: string | null;
  notes?: string | null;
};

/**
 * Reserva só existe onde faz sentido: plano não arquivado, não cancelado, com
 * data confirmada, em `planned` ou `reserved` (seção 8).
 *
 * Reserva sem data não é reserva — e é por isso que a checagem é de fato, não
 * de status: um plano pode estar em `planned` sem data confirmada se alguém
 * tiver desmarcado a data, e aí a reserva também não faz sentido.
 */
async function assertReservationAllowed(
  tx: Tx,
  ctx: AuthorizedContext,
  plano: PlanoTravado,
): Promise<void> {
  assertWritable(plano);

  if (!plano.requiresBooking) {
    throw new ValidationError(
      "Marque que o plano precisa de reserva antes de tratar a reserva.",
    );
  }

  if (plano.status !== "planned" && plano.status !== "reserved") {
    throw new ValidationError(
      "A reserva aparece depois que o plano tem uma data confirmada.",
    );
  }

  const facts = await readPlanFacts(ctx, plano.id, tx);

  if (!facts.hasConfirmedDate) {
    throw new ValidationError(
      "Confirme uma das datas antes de tratar a reserva.",
    );
  }
}

/** Cria ou atualiza os campos da reserva, sem mexer no estado dela. */
export async function saveReservationDetails(
  ctx: AuthorizedContext,
  planId: string,
  input: ReservationInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const plano = await lockPlan(tx, ctx, planId);
    await assertReservationAllowed(tx, ctx, plano);

    const campos = {
      code: input.code ?? null,
      reservedTime: input.reservedTime ?? null,
      url: input.url ?? null,
      notes: input.notes ?? null,
      updatedAt: new Date(),
    };

    await tx
      .insert(reservations)
      .values({
        workspaceId: ctx.workspaceId,
        planId,
        createdBy: ctx.profileId,
        ...campos,
      })
      /* Uma reserva por plano é garantia do banco; aqui o upsert existe para o
         primeiro salvamento e a edição serem o mesmo caminho. */
      .onConflictDoUpdate({
        target: reservations.planId,
        set: campos,
      });
  });
}

/**
 * Muda o estado da reserva e, com ele, o status do plano.
 *
 * - confirmar em `planned` → `reserved`;
 * - desfazer em `reserved` → `planned`.
 *
 * Sempre na mesma transação, sempre emitindo evento. É o inverso exato do que
 * o botão de status faz: quem desfaz reserva é a reserva.
 */
export async function setReservationStatus(
  ctx: AuthorizedContext,
  planId: string,
  status: ReservationStatus,
): Promise<void> {
  const intents = await db.transaction(async (tx) => {
    const plano = await lockPlan(tx, ctx, planId);
    await assertReservationAllowed(tx, ctx, plano);

    const [atual] = await tx
      .select({ id: reservations.id, status: reservations.status })
      .from(reservations)
      .where(
        and(
          eq(reservations.workspaceId, ctx.workspaceId),
          eq(reservations.planId, planId),
        ),
      )
      .limit(1);

    if (!atual) {
      await tx.insert(reservations).values({
        workspaceId: ctx.workspaceId,
        planId,
        createdBy: ctx.profileId,
        status,
      });
    } else {
      /* Mesmo estado não é mudança: não grava evento e não notifica. */
      if (atual.status === status) return [] as string[];

      await tx
        .update(reservations)
        .set({ status, updatedAt: new Date() })
        .where(
          and(
            eq(reservations.workspaceId, ctx.workspaceId),
            eq(reservations.planId, planId),
          ),
        );
    }

    /* A transição automática (D-063). `planned` e `reserved` são os únicos
       estados possíveis aqui, garantidos por assertReservationAllowed. */
    if (status === "confirmed" && plano.status === "planned") {
      await moveStatus(tx, ctx, planId, "reserved");
    } else if (status !== "confirmed" && plano.status === "reserved") {
      await moveStatus(tx, ctx, planId, "planned");
    }

    /* Só a reserva entra no feed, e só quando o **estado** muda: gravar cada
       edição de observação seria o log de edição que a seção 7 proíbe. */
    await tx.insert(activityEvents).values({
      workspaceId: ctx.workspaceId,
      actorProfileId: ctx.profileId,
      verb: "booking_updated",
      subjectType: "plan",
      subjectId: planId,
      metadata: { status },
    });

    /* `expected` guarda o estado afirmado. Confirmar a reserva e desfazer
       dentro da hora faz a revalidação encontrar `pending` onde a intent
       esperava `confirmed`, e o push de confirmação não sai. */
    return enqueuePartnerIntent(tx, ctx, {
      kind: "booking_updated",
      planId,
      now: new Date(),
      expected: { reservationStatus: status },
    });
  });

  await startNotificationWorkflows(intents);
}

/* ------------------------------------------------------------------ *
 * Checklist
 * ------------------------------------------------------------------ */

export async function addChecklistItem(
  ctx: AuthorizedContext,
  planId: string,
  label: string,
): Promise<void> {
  const texto = label.trim();

  if (texto.length === 0) {
    throw new ValidationError("Escreva o que precisa ser lembrado.");
  }

  await db.transaction(async (tx) => {
    const plano = await lockPlan(tx, ctx, planId);
    assertChecklistWritable(plano);

    const [contagem] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        topo: max(checklistItems.position),
      })
      .from(checklistItems)
      .where(
        and(
          eq(checklistItems.workspaceId, ctx.workspaceId),
          eq(checklistItems.planId, planId),
        ),
      );

    /* Teto de usabilidade, não invariante: vive na aplicação para mudar de
       ideia não exigir migration (D-065). */
    if ((contagem?.total ?? 0) >= MAX_CHECKLIST_ITEMS) {
      throw new ValidationError(
        `São no máximo ${MAX_CHECKLIST_ITEMS} itens por plano.`,
      );
    }

    await tx.insert(checklistItems).values({
      workspaceId: ctx.workspaceId,
      planId,
      label: texto,
      position: (contagem?.topo ?? -1) + 1,
    });
  });
}

/**
 * Marca ou desmarca. Autor e horário vão e voltam **juntos** — o CHECK
 * `checklist_items_done_together` recusaria qualquer outra coisa, e é ele a
 * garantia; isto aqui é só o caminho normal.
 */
export async function toggleChecklistItem(
  ctx: AuthorizedContext,
  itemId: string,
  done: boolean,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [item] = await tx
      .select({ id: checklistItems.id, planId: checklistItems.planId })
      .from(checklistItems)
      .where(
        and(
          eq(checklistItems.workspaceId, ctx.workspaceId),
          eq(checklistItems.id, itemId),
        ),
      )
      .limit(1);

    if (!item) {
      throw new NotFoundError("Item");
    }

    assertChecklistWritable(await lockPlan(tx, ctx, item.planId));

    await tx
      .update(checklistItems)
      .set(
        done
          ? { doneAt: new Date(), doneBy: ctx.profileId }
          : { doneAt: null, doneBy: null },
      )
      .where(
        and(
          eq(checklistItems.workspaceId, ctx.workspaceId),
          eq(checklistItems.id, itemId),
        ),
      );
  });
}

export async function deleteChecklistItem(
  ctx: AuthorizedContext,
  itemId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [item] = await tx
      .select({ planId: checklistItems.planId })
      .from(checklistItems)
      .where(
        and(
          eq(checklistItems.workspaceId, ctx.workspaceId),
          eq(checklistItems.id, itemId),
        ),
      )
      .limit(1);

    if (!item) {
      throw new NotFoundError("Item");
    }

    assertChecklistWritable(await lockPlan(tx, ctx, item.planId));

    await tx
      .delete(checklistItems)
      .where(
        and(
          eq(checklistItems.workspaceId, ctx.workspaceId),
          eq(checklistItems.id, itemId),
        ),
      );
  });
}

/**
 * Sobe ou desce um item, trocando a posição com o vizinho.
 *
 * Par de setas, não arrasto: distinguir arrasto de rolagem em toque exige
 * biblioteca, e o par de setas funciona no teclado (decisão do B5, mantida).
 *
 * A troca acontece com o plano travado, então duas reordenações simultâneas não
 * podem gerar duas posições iguais.
 */
export async function moveChecklistItem(
  ctx: AuthorizedContext,
  itemId: string,
  direction: "up" | "down",
): Promise<void> {
  await db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        id: checklistItems.id,
        planId: checklistItems.planId,
        position: checklistItems.position,
      })
      .from(checklistItems)
      .where(
        and(
          eq(checklistItems.workspaceId, ctx.workspaceId),
          eq(checklistItems.id, itemId),
        ),
      )
      .limit(1);

    if (!item) {
      throw new NotFoundError("Item");
    }

    assertChecklistWritable(await lockPlan(tx, ctx, item.planId));

    const subindo = direction === "up";

    const [vizinho] = await tx
      .select({ id: checklistItems.id, position: checklistItems.position })
      .from(checklistItems)
      .where(
        and(
          eq(checklistItems.workspaceId, ctx.workspaceId),
          eq(checklistItems.planId, item.planId),
          subindo
            ? sql`${checklistItems.position} < ${item.position}`
            : sql`${checklistItems.position} > ${item.position}`,
        ),
      )
      .orderBy(
        subindo ? desc(checklistItems.position) : asc(checklistItems.position),
      )
      .limit(1);

    // Primeiro item subindo, ou último descendo: nada a fazer, e não é erro.
    if (!vizinho) return;

    await tx
      .update(checklistItems)
      .set({ position: vizinho.position })
      .where(eq(checklistItems.id, item.id));

    await tx
      .update(checklistItems)
      .set({ position: item.position })
      .where(eq(checklistItems.id, vizinho.id));
  });
}

/* ------------------------------------------------------------------ *
 * Gastos
 * ------------------------------------------------------------------ */

export type ExpenseInput = {
  label: string;
  amountCents: number;
  paidBy?: string | null;
};

export async function addExpense(
  ctx: AuthorizedContext,
  planId: string,
  input: ExpenseInput,
): Promise<void> {
  const texto = input.label.trim();

  if (texto.length === 0) {
    throw new ValidationError("Escreva no que foi o gasto.");
  }

  /* O banco também recusa por CHECK; aqui a recusa vira mensagem. Erro de
     driver não tem como ser explicado a quem digitou. */
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) {
    throw new ValidationError("O valor precisa ser positivo.");
  }

  if (input.amountCents > MAX_CENTS) {
    throw new ValidationError(
      `O valor máximo é ${formatCents(MAX_CENTS)}. Confira se não sobrou um zero.`,
    );
  }

  await db.transaction(async (tx) => {
    const plano = await lockPlan(tx, ctx, planId);
    assertWritable(plano);

    if (input.paidBy) {
      const [membro] = await tx
        .select({ profileId: workspaceMembers.profileId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, ctx.workspaceId),
            eq(workspaceMembers.profileId, input.paidBy),
          ),
        )
        .limit(1);

      if (!membro) {
        throw new ValidationError("Escolha uma pessoa deste DATE.");
      }
    }

    const [contagem] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(expenses)
      .where(
        and(
          eq(expenses.workspaceId, ctx.workspaceId),
          eq(expenses.planId, planId),
        ),
      );

    if ((contagem?.total ?? 0) >= MAX_EXPENSES_PER_PLAN) {
      throw new ValidationError(
        `São no máximo ${MAX_EXPENSES_PER_PLAN} gastos por plano.`,
      );
    }

    await tx.insert(expenses).values({
      workspaceId: ctx.workspaceId,
      planId,
      label: texto,
      amountCents: input.amountCents,
      paidBy: input.paidBy ?? null,
    });
  });
}

export async function deleteExpense(
  ctx: AuthorizedContext,
  expenseId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [gasto] = await tx
      .select({ planId: expenses.planId })
      .from(expenses)
      .where(
        and(
          eq(expenses.workspaceId, ctx.workspaceId),
          eq(expenses.id, expenseId),
        ),
      )
      .limit(1);

    if (!gasto) {
      throw new NotFoundError("Gasto");
    }

    assertWritable(await lockPlan(tx, ctx, gasto.planId));

    await tx
      .delete(expenses)
      .where(
        and(
          eq(expenses.workspaceId, ctx.workspaceId),
          eq(expenses.id, expenseId),
        ),
      );
  });
}

/* ------------------------------------------------------------------ *
 * Status do plano, com as pré-condições
 * ------------------------------------------------------------------ */

/**
 * A **segunda** das duas consultas às pré-condições (seção 4).
 *
 * A interface já filtrou os botões com `offerableTransitions`; isto aqui não
 * confia nela. O frontend nunca é fonte de autoridade, e a checagem acontece
 * com o plano travado, dentro da transação que vai escrever.
 */
export async function assertTransitionAllowed(
  tx: Tx,
  ctx: AuthorizedContext,
  planId: string,
  from: PlanStatus,
  to: PlanStatus,
): Promise<void> {
  const facts = await readPlanFacts(ctx, planId, tx);
  const bloqueio = transitionBlock(from, to, facts);

  if (bloqueio) {
    throw new ValidationError(bloqueio);
  }
}

/**
 * Desmarcar "precisa de reserva" não pode esconder uma reserva confirmada.
 *
 * A leitura usa a transação de `updatePlan`, que já travou o plano. A mutation
 * da reserva trava a mesma linha antes de confirmar, então não existe janela
 * entre esta checagem e a atualização.
 */
export async function assertBookingRequirementCanBeDisabled(
  tx: Tx,
  ctx: AuthorizedContext,
  planId: string,
): Promise<void> {
  const facts = await readPlanFacts(ctx, planId, tx);

  if (facts.hasConfirmedReservation) {
    throw new ValidationError(
      "Desfaça a reserva antes de dizer que o plano não precisa dela.",
    );
  }
}
