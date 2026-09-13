import "server-only";

import { and, asc, count, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  checklistItems,
  expenses,
  planDateOptions,
  plans,
  profiles,
  reservations,
} from "@/db/schema/index.ts";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { isFutureCivilDay } from "@/lib/datetime";
import type { PlanFacts } from "@/lib/plan-preconditions";
import { sumCents } from "@/lib/money";

/**
 * Leituras de reserva, checklist e gastos.
 *
 * Contexto em primeiro lugar, `workspaceId` nunca é parâmetro, todo `where`
 * começa pelo predicado de workspace (D-037).
 *
 * As três moram numa pasta só porque são irmãs: vivem na mesma tela, e a
 * reserva já precisa falar com a máquina de status junto do plano. Três pastas
 * para três tabelas pequenas seria cerimônia; `queries.ts` e `mutations.ts`
 * separam o que de fato importa separar.
 */

export type Reservation = typeof reservations.$inferSelect;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type Expense = typeof expenses.$inferSelect;

/** Item do checklist com o nome de quem marcou, para a linha "Nina, ontem". */
export type ChecklistEntry = ChecklistItem & {
  doneByName: string | null;
};

export type ExpenseEntry = Expense & {
  paidByName: string | null;
};

export async function getReservation(
  ctx: AuthorizedContext,
  planId: string,
): Promise<Reservation | null> {
  const [linha] = await db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.workspaceId, ctx.workspaceId),
        eq(reservations.planId, planId),
      ),
    )
    .limit(1);

  return linha ?? null;
}

export async function listChecklist(
  ctx: AuthorizedContext,
  planId: string,
): Promise<ChecklistEntry[]> {
  const linhas = await db
    .select({
      item: checklistItems,
      doneByName: profiles.displayName,
    })
    .from(checklistItems)
    .leftJoin(profiles, eq(profiles.id, checklistItems.doneBy))
    .where(
      and(
        eq(checklistItems.workspaceId, ctx.workspaceId),
        eq(checklistItems.planId, planId),
      ),
    )
    .orderBy(asc(checklistItems.position), asc(checklistItems.createdAt));

  return linhas.map(({ item, doneByName }) => ({ ...item, doneByName }));
}

export async function listExpenses(
  ctx: AuthorizedContext,
  planId: string,
): Promise<ExpenseEntry[]> {
  const linhas = await db
    .select({
      expense: expenses,
      paidByName: profiles.displayName,
    })
    .from(expenses)
    .leftJoin(profiles, eq(profiles.id, expenses.paidBy))
    .where(
      and(
        eq(expenses.workspaceId, ctx.workspaceId),
        eq(expenses.planId, planId),
      ),
    )
    .orderBy(asc(expenses.createdAt));

  return linhas.map(({ expense, paidByName }) => ({ ...expense, paidByName }));
}

/** Soma de inteiros, pelo módulo que é dono do dinheiro. */
export function totalCents(items: readonly { amountCents: number }[]): number {
  return sumCents(items.map((item) => item.amountCents));
}

/**
 * Os fatos que as pré-condições de status consultam.
 *
 * Aceita a transação de quem chamou, para a **segunda** consulta acontecer
 * dentro da mesma transação que já travou o plano — sem isso haveria janela
 * entre a checagem e a escrita, que é o bug que o D-055 existe para fechar.
 */
export async function readPlanFacts(
  ctx: AuthorizedContext,
  planId: string,
  tx: Pick<typeof db, "select"> = db,
  now: Date = new Date(),
): Promise<PlanFacts> {
  /* Lê o instante em vez de contar (B9): o fato "existe data confirmada" e o
     fato "essa data ainda não chegou" saem da mesma linha, e continuam sendo
     uma consulta só. O corte por dia civil acontece em JavaScript porque o
     banco não conhece `America/Sao_Paulo` — um `starts_at < now()` no `where`
     recusaria, às três da tarde, um date que é hoje às oito (D-061). */
  const [datas] = await tx
    .select({ startsAt: planDateOptions.startsAt })
    .from(planDateOptions)
    .where(
      and(
        eq(planDateOptions.workspaceId, ctx.workspaceId),
        eq(planDateOptions.planId, planId),
        eq(planDateOptions.isConfirmed, true),
      ),
    )
    .limit(1);

  const [reserva] = await tx
    .select({ total: count() })
    .from(reservations)
    .where(
      and(
        eq(reservations.workspaceId, ctx.workspaceId),
        eq(reservations.planId, planId),
        eq(reservations.status, "confirmed"),
      ),
    );

  return {
    hasConfirmedDate: datas !== undefined,
    hasConfirmedReservation: (reserva?.total ?? 0) > 0,
    confirmedDateIsFuture:
      datas !== undefined && isFutureCivilDay(datas.startsAt, now),
  };
}

/** Plano cancelado ou arquivado é leitura nas três seções (seção 8). */
export function isReadOnly(plan: {
  status: string;
  archivedAt: Date | null;
}): boolean {
  return plan.status === "cancelled" || plan.archivedAt !== null;
}

/** Reserva exige data confirmada: reserva sem data não é reserva (seção 8). */
export function reservationAvailable(
  plan: { status: string; archivedAt: Date | null },
  facts: PlanFacts,
): boolean {
  if (isReadOnly(plan)) return false;
  if (!facts.hasConfirmedDate) return false;

  return plan.status === "planned" || plan.status === "reserved";
}

/** Usado pela interface para saber se o plano existe neste workspace. */
export async function planExists(
  ctx: AuthorizedContext,
  planId: string,
): Promise<boolean> {
  const [plano] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)))
    .limit(1);

  return Boolean(plano);
}
