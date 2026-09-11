import "server-only";

import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { activityEvents, plans } from "@/db/schema/index.ts";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { NotFoundError } from "@/lib/errors";
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
  return db.transaction(async (tx) => {
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

    return plan;
  });
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

  const [plan] = await db
    .update(plans)
    .set({ ...changes, updatedAt: new Date() })
    .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)))
    .returning();

  if (!plan) {
    throw new NotFoundError("Plano");
  }

  return plan;
}

export async function changePlanStatus(
  ctx: AuthorizedContext,
  planId: string,
  nextStatus: PlanStatus,
): Promise<Plan> {
  return db.transaction(async (tx) => {
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

    return plan;
  });
}

/** Arquivar esconde da lista. É ortogonal a status: não é cancelar. */
export async function archivePlan(
  ctx: AuthorizedContext,
  planId: string,
): Promise<Plan> {
  const [plan] = await db
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

  if (!plan) {
    throw new NotFoundError("Plano");
  }

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
