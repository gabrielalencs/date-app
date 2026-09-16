import "server-only";

import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { activityEvents, plans } from "@/db/schema/index.ts";
import {
  cancelDateReminders,
  enqueuePartnerIntent,
} from "@/features/notifications/data/outbox";
import { startNotificationWorkflows } from "@/features/notifications/workflow/start";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { NotFoundError } from "@/lib/errors";
import {
  assertBookingRequirementCanBeDisabled,
  assertTransitionAllowed,
} from "@/features/planning/data/mutations";
import { assertTransition } from "@/lib/plan-status";
import type { PlanStatus } from "@/lib/status";

/**
 * Escritas de plano.
 *
 * O predicado de workspace vai dentro do UPDATE, com RETURNING: zero linhas é
 * NotFoundError. Nunca se busca por id e depois atualiza — a janela entre a
 * checagem e a escrita é o bug (docs/DATA_ACCESS.md seção 3).
 *
 * A exceção é a mudança de status, que precisa conhecer o estado atual para
 * validar a transição. Ali a leitura acontece dentro da transação e com trava
 * de linha, então a janela não existe.
 */
export type Plan = typeof plans.$inferSelect;

export type CreatePlanInput = {
  title: string;
  category: string;
  sourceUrl?: string | null;
};

export type UpdatePlanInput = {
  title?: string;
  description?: string | null;
  category?: string;
  priority?: number;
  placeName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  sourceUrl?: string | null;
  estimatedBudgetCents?: number | null;
  durationMinutes?: number | null;
  requiresBooking?: boolean;
  notes?: string | null;
};

export async function createPlan(
  ctx: AuthorizedContext,
  input: CreatePlanInput,
): Promise<Plan> {
  const { plan, intents } = await db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({
        workspaceId: ctx.workspaceId,
        title: input.title,
        category: input.category,
        sourceUrl: input.sourceUrl ?? null,
        createdBy: ctx.profileId,
      })
      .returning();

    if (!plan) {
      throw new Error("Falha ao criar o plano.");
    }

    // Mesma transação: se o evento falhar, a criação reverte.
    await tx.insert(activityEvents).values({
      workspaceId: ctx.workspaceId,
      actorProfileId: ctx.profileId,
      verb: "plan_created",
      subjectType: "plan",
      subjectId: plan.id,
      metadata: { title: plan.title },
    });

    /* Outbox: a intenção nasce na mesma transação do plano. Se ela falhar, o
       plano reverte junto — nunca existe promessa de notificação sobre um fato
       que não foi gravado (seção 19 do docs/NOTIFICATIONS.md). */
    const intents = await enqueuePartnerIntent(tx, ctx, {
      kind: "plan_created",
      planId: plan.id,
      now: new Date(),
    });

    return { plan, intents };
  });

  /* Fora da transação, sempre. Se o Workflow estiver fora do ar, o plano
     continua criado e o recovery encontra a intent pelo índice de vencidas. */
  await startNotificationWorkflows(intents);

  return plan;
}

export async function updatePlan(
  ctx: AuthorizedContext,
  planId: string,
  input: UpdatePlanInput,
): Promise<Plan> {
  const changes = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );

  if (Object.keys(changes).length === 0) {
    return getPlanOrThrow(ctx, planId);
  }

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)))
      .for("update")
      .limit(1);

    if (!current) {
      throw new NotFoundError("Plano");
    }

    if (input.requiresBooking === false) {
      await assertBookingRequirementCanBeDisabled(tx, ctx, planId);
    }

    const [plan] = await tx
      .update(plans)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)))
      .returning();

    if (!plan) {
      throw new NotFoundError("Plano");
    }

    return plan;
  });
}

export async function changePlanStatus(
  ctx: AuthorizedContext,
  planId: string,
  nextStatus: PlanStatus,
): Promise<Plan> {
  const { plan, intents } = await db.transaction(async (tx) => {
    /* Trava a linha antes de validar: sem isso, duas mudanças simultâneas
       poderiam passar as duas pela máquina e gravar um estado impossível. */
    const [current] = await tx
      .select({ id: plans.id, status: plans.status })
      .from(plans)
      .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)))
      .for("update")
      .limit(1);

    if (!current) {
      throw new NotFoundError("Plano");
    }

    // Lança InvalidTransitionError em vez de virar no-op silencioso.
    assertTransition(current.status, nextStatus);

    /* As pré-condições moram num lugar só e são consultadas duas vezes: a
       interface já filtrou os botões com `offerableTransitions`, e isto aqui
       não confia nela. A leitura acontece dentro da mesma transação que já
       travou o plano, então não há janela entre a checagem e a escrita.

       Cobre as três: `deciding → planned` exige data confirmada (do B6),
       `planned → reserved` exige reserva confirmada, e `reserved → planned`
       exige que não haja — quem desfaz reserva é a reserva, não este botão. */
    await assertTransitionAllowed(tx, ctx, planId, current.status, nextStatus);

    const [plan] = await tx
      .update(plans)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)))
      .returning();

    if (!plan) {
      throw new NotFoundError("Plano");
    }

    if (nextStatus === "completed") {
      await tx.insert(activityEvents).values({
        workspaceId: ctx.workspaceId,
        actorProfileId: ctx.profileId,
        verb: "plan_completed",
        subjectType: "plan",
        subjectId: plan.id,
        metadata: { title: plan.title },
      });
    }

    /* `completed` e `cancelled` notificam; os outros movimentos, não. Passar
       por `deciding` ou `planned` é parte da negociação e já aparece no feed —
       avisar cada degrau seria o log de edição que a seção 9 proíbe.

       Os dois também encerram o date, então os lembretes pendentes são
       cancelados aqui. A revalidação sozinha já os impediria de sair; cancelar
       deixa a tabela dizendo a verdade sobre o que ainda vai acontecer. */
    const encerra = nextStatus === "completed" || nextStatus === "cancelled";
    if (!encerra) {
      return { plan, intents: [] as string[] };
    }

    await cancelDateReminders(tx, ctx, plan.id);

    const intents = await enqueuePartnerIntent(tx, ctx, {
      kind: nextStatus === "completed" ? "plan_completed" : "plan_cancelled",
      planId: plan.id,
      now: new Date(),
    });

    return { plan, intents };
  });

  await startNotificationWorkflows(intents);

  return plan;
}

/**
 * Arquivar esconde da lista. É ortogonal a status: não é cancelar.
 *
 * Virou transação no B11.5. Antes era um UPDATE solto, e continuaria correto
 * assim — mas a intenção de notificar precisa nascer junto com o fato, e "junto"
 * só existe dentro de uma transação. O UPDATE continua carregando o predicado
 * de workspace e o `isNull`, então a idempotência não mudou.
 */
export async function archivePlan(
  ctx: AuthorizedContext,
  planId: string,
): Promise<Plan> {
  const { plan, intents } = await db.transaction(async (tx) => {
    const [linha] = await tx
      .update(plans)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(plans.workspaceId, ctx.workspaceId),
          eq(plans.id, planId),
          isNull(plans.archivedAt),
        ),
      )
      .returning();

    if (!linha) {
      throw new NotFoundError("Plano");
    }

    await cancelDateReminders(tx, ctx, linha.id);

    const intents = await enqueuePartnerIntent(tx, ctx, {
      kind: "plan_archived",
      planId: linha.id,
      now: new Date(),
    });

    return { plan: linha, intents };
  });

  await startNotificationWorkflows(intents);

  return plan;
}

export async function unarchivePlan(
  ctx: AuthorizedContext,
  planId: string,
): Promise<Plan> {
  const [plan] = await db
    .update(plans)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(plans.workspaceId, ctx.workspaceId),
        eq(plans.id, planId),
        isNotNull(plans.archivedAt),
      ),
    )
    .returning();

  if (!plan) {
    throw new NotFoundError("Plano");
  }

  return plan;
}

async function getPlanOrThrow(
  ctx: AuthorizedContext,
  planId: string,
): Promise<Plan> {
  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)))
    .limit(1);

  if (!plan) {
    throw new NotFoundError("Plano");
  }

  return plan;
}
