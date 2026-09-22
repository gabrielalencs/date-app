import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from "drizzle-orm";

import { db } from "@/db/client";
import { plans, reactions } from "@/db/schema/index.ts";
import type { OpinionType } from "@/features/reactions/constants";
import { listPlanReactionSummaries } from "@/features/reactions/data/queries";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { NotFoundError } from "@/lib/errors";
import { OPEN_STATUSES } from "@/lib/plan-status";
import type { PlanStatus } from "@/lib/status";

/**
 * Leituras de plano. O contexto é sempre o primeiro parâmetro e `workspaceId`
 * nunca é parâmetro: quem precisa do workspace tira dele (D-037).
 *
 * Todo `where` começa pelo predicado de workspace, inclusive quando o filtro
 * por id pareceria suficiente.
 */
export type PlanSummary = {
  id: string;
  title: string;
  category: string | null;
  status: PlanStatus;
  /** O lugar como o card mostra: o bairro, ou a cidade das linhas antigas. */
  placeName: string | null;
  city: string | null;
  /** Capa real do plano. Nulo mantém a capa tipográfica do card (D-041). */
  coverMediaId: string | null;
  priority: number;
  estimatedBudgetCents: number | null;
  archivedAt: Date | null;
  createdAt: Date;
  /** Favorito é sempre o da pessoa atual; nunca a união do workspace. */
  isFavorite: boolean;
  myOpinion: OpinionType | null;
  /** O topo da escala de opinião é visível para as duas pessoas. */
  lovedBy: readonly string[];
};

export type Plan = typeof plans.$inferSelect;

export type PlanSort = "recent" | "priority" | "budget";

export type ListPlansOptions = {
  status?: PlanStatus | "open";
  category?: string;
  sort?: PlanSort;
  includeArchived?: boolean;
  limit?: number;
  maxBudgetCents?: number;
  favoritesOnly?: boolean;
};

function orderFor(sort: PlanSort) {
  switch (sort) {
    case "priority":
      // Prioridade alta primeiro; empate desempata pelo mais recente.
      return [desc(plans.priority), desc(plans.createdAt)];
    case "budget":
      // NULLS LAST para plano sem orçamento não encabeçar a lista.
      return [
        sql`${plans.estimatedBudgetCents} asc nulls last`,
        asc(plans.title),
      ];
    case "recent":
      return [desc(plans.createdAt)];
  }
}

export async function listPlans(
  ctx: AuthorizedContext,
  options: ListPlansOptions = {},
): Promise<PlanSummary[]> {
  const {
    status,
    category,
    sort = "recent",
    includeArchived = false,
    maxBudgetCents,
    favoritesOnly = false,
  } = options;

  const conditions = [eq(plans.workspaceId, ctx.workspaceId)];

  if (status === "open") {
    conditions.push(inArray(plans.status, [...OPEN_STATUSES]));
  } else if (status) {
    conditions.push(eq(plans.status, status));
  }

  if (category) {
    conditions.push(eq(plans.category, category));
  }

  if (!includeArchived) {
    conditions.push(isNull(plans.archivedAt));
  }

  if (maxBudgetCents !== undefined) {
    conditions.push(lte(plans.estimatedBudgetCents, maxBudgetCents));
  }

  if (favoritesOnly) {
    conditions.push(
      exists(
        db
          .select({ id: reactions.id })
          .from(reactions)
          .where(
            and(
              eq(reactions.workspaceId, ctx.workspaceId),
              eq(reactions.planId, plans.id),
              eq(reactions.profileId, ctx.profileId),
              eq(reactions.type, "favorite"),
            ),
          ),
      ),
    );
  }

  const rows = await db
    .select({
      id: plans.id,
      title: plans.title,
      category: plans.category,
      status: plans.status,
      placeName: plans.placeName,
      city: plans.city,
      coverMediaId: plans.coverMediaId,
      priority: plans.priority,
      estimatedBudgetCents: plans.estimatedBudgetCents,
      archivedAt: plans.archivedAt,
      createdAt: plans.createdAt,
    })
    .from(plans)
    .where(and(...conditions))
    .orderBy(...orderFor(sort))
    .limit(options.limit ?? 200);

  const reactionSummaries = await listPlanReactionSummaries(
    ctx,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    ...row,
    ...(reactionSummaries.get(row.id) ?? {
      isFavorite: false,
      myOpinion: null,
      lovedBy: [],
    }),
  }));
}

export type ArchivedPlan = {
  id: string;
  title: string;
  category: string | null;
  status: PlanStatus;
  coverMediaId: string | null;
  archivedAt: Date;
};

/**
 * O arquivo, que até aqui não tinha porta de entrada.
 *
 * `archivedAt` esconde o plano de `/ideias`, `/agenda`, `/memorias` e do próximo
 * DATE — de tudo. Quem arquivava só voltava atrás se tivesse guardado a URL do
 * plano, porque o botão de restaurar mora na página de detalhe e a página de
 * detalhe tinha deixado de ser alcançável. Arquivar era, na prática, apagar.
 *
 * Isto é o inverso exato de `listPlans`: em vez de `isNull`, `isNotNull`. Ideia
 * e memória saem juntas na mesma lista porque as duas são `plans` — o que muda
 * entre elas é o status, e ele vai junto para a tela saber dizer qual é qual.
 */
export async function listArchivedPlans(
  ctx: AuthorizedContext,
): Promise<ArchivedPlan[]> {
  const rows = await db
    .select({
      id: plans.id,
      title: plans.title,
      category: plans.category,
      status: plans.status,
      coverMediaId: plans.coverMediaId,
      archivedAt: plans.archivedAt,
    })
    .from(plans)
    .where(
      and(eq(plans.workspaceId, ctx.workspaceId), isNotNull(plans.archivedAt)),
    )
    /* Mais recém-arquivado primeiro: quem abre esta tela quase sempre quer
       desfazer o que acabou de fazer. */
    .orderBy(desc(plans.archivedAt))
    .limit(200);

  /* O `isNotNull` do where já garante isto; o filtro existe para o tipo, que
     promete `Date` e não `Date | null`. */
  return rows.flatMap((row) =>
    row.archivedAt ? [{ ...row, archivedAt: row.archivedAt }] : [],
  );
}

/** Lança NotFoundError se o plano não existir ou for de outro workspace. */
export async function getPlan(
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

export type StatusCount = { status: PlanStatus; total: number };

export async function countPlansByStatus(
  ctx: AuthorizedContext,
  options: { includeArchived?: boolean } = {},
): Promise<StatusCount[]> {
  const conditions = [eq(plans.workspaceId, ctx.workspaceId)];

  if (!options.includeArchived) {
    conditions.push(isNull(plans.archivedAt));
  }

  const rows = await db
    .select({ status: plans.status, total: count() })
    .from(plans)
    .where(and(...conditions))
    .groupBy(plans.status);

  return rows.map((row) => ({ status: row.status, total: Number(row.total) }));
}
