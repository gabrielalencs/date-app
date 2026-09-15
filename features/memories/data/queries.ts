import "server-only";

import { and, count, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import {
  memoryRatings,
  planDateOptions,
  plans,
} from "@/db/schema/index.ts";
import { listWorkspaceMembers } from "@/features/dates/data/queries";
import { MEMORIES_PER_PAGE } from "@/features/memories/constants";
import { pageCount } from "@/features/memories/url";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import {
  isRatingValue,
  isRepeatAnswer,
  summarizeRatings,
  type MemberRating,
  type RatingSummary,
} from "@/lib/rating";

/**
 * Leituras das memórias. Contexto em primeiro lugar, `workspaceId` nunca é
 * parâmetro, todo `where` começa pelo predicado de workspace (D-037).
 *
 * A exigência de escala da seção 7 mora aqui:
 *
 * > O número de consultas da timeline é constante em relação ao número de
 * > planos.
 *
 * `listMemories` faz **duas** consultas — o total e a página — e faria as
 * mesmas duas com seiscentos planos realizados. A capa vem de
 * `plans.cover_media_id`, que já está na linha do plano, e por isso não custa
 * uma terceira. O que o documento descreve como defeito é a versão que busca
 * capa, contagem de fotos e avaliação **por linha**: 24 memórias virariam 72
 * idas e volta até `sa-east-1`, e a tela levaria três segundos.
 *
 * A prova disso não é leitura de código: é `tests/integration/memories-scale`,
 * que conta as consultas com um plano e com sessenta e compara os números.
 */
export type MemoryEntry = {
  planId: string;
  title: string;
  city: string | null;
  placeName: string | null;
  /** Nulo mantém a capa tipográfica do card (D-041). */
  coverMediaId: string | null;
  category: string | null;
  /** A data confirmada: é ela que diz quando o date aconteceu. */
  happenedAt: Date;
  allDay: boolean;
};

export type MemoriesPage = {
  entries: MemoryEntry[];
  /** Contado de 1, já preso ao intervalo existente. */
  page: number;
  pageCount: number;
  total: number;
};

/**
 * A timeline: dates realizados, do mais recente para o mais antigo.
 *
 * `innerJoin` com a opção confirmada, e não `leftJoin`: um plano `completed`
 * sem data confirmada é inalcançável desde a pré-condição do B9, e se algum
 * sobrou de antes, ele não tem onde entrar numa lista ordenada por data.
 *
 * Plano arquivado fica de fora, como em toda lista do produto. Cancelado
 * também, mas por construção: `cancelled` não é `completed`.
 */
export async function listMemories(
  ctx: AuthorizedContext,
  options: { page?: number; perPage?: number } = {},
): Promise<MemoriesPage> {
  const perPage = options.perPage ?? MEMORIES_PER_PAGE;

  const escopo = and(
    eq(plans.workspaceId, ctx.workspaceId),
    eq(planDateOptions.workspaceId, ctx.workspaceId),
    eq(plans.status, "completed"),
    eq(planDateOptions.isConfirmed, true),
    isNull(plans.archivedAt),
  );

  // 1 de 2: o total, que a paginação precisa para saber onde a lista acaba.
  const [contagem] = await db
    .select({ total: count() })
    .from(plans)
    .innerJoin(planDateOptions, eq(planDateOptions.planId, plans.id))
    .where(escopo);

  const total = Number(contagem?.total ?? 0);
  const paginas = pageCount(total, perPage);
  /* Página além do fim cai na última, em vez de devolver lista vazia com
     paginação quebrada — `?pagina=999` é URL editada à mão, não erro. */
  const page = Math.min(Math.max(options.page ?? 1, 1), paginas);

  // 2 de 2: a página. Uma consulta, quantos planos existirem.
  const entries = await db
    .select({
      planId: plans.id,
      title: plans.title,
      city: plans.city,
      placeName: plans.placeName,
      coverMediaId: plans.coverMediaId,
      category: plans.category,
      happenedAt: planDateOptions.startsAt,
      allDay: planDateOptions.allDay,
    })
    .from(plans)
    .innerJoin(planDateOptions, eq(planDateOptions.planId, plans.id))
    .where(escopo)
    /* `id` desempata: sem um critério estável, dois dates no mesmo instante
       podem trocar de lugar entre uma página e outra e sumir da listagem. */
    .orderBy(desc(planDateOptions.startsAt), desc(plans.id))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { entries, page, pageCount: paginas, total };
}

export type PlanRatings = {
  members: readonly MemberRating[];
  summary: RatingSummary;
  /** A avaliação de quem está olhando, para preencher o formulário. */
  mine: MemberRating | null;
};

/**
 * As duas avaliações de um plano, **sempre as duas**.
 *
 * Membro sem linha entra com `rating: null`: não avaliar é estado distinto de
 * dar nota baixa, e a ausência aparece como "Alex ainda não avaliou", não como
 * zero (seção 4). É a mesma montagem que `listPlanDateOptions` faz com os
 * votos, e pela mesma razão.
 *
 * Duas consultas fixas — os membros e as avaliações —, não uma por pessoa.
 */
export async function listPlanRatings(
  ctx: AuthorizedContext,
  planId: string,
): Promise<PlanRatings> {
  const [membros, linhas] = await Promise.all([
    listWorkspaceMembers(ctx),
    db
      .select({
        profileId: memoryRatings.profileId,
        rating: memoryRatings.rating,
        wouldRepeat: memoryRatings.wouldRepeat,
        highlight: memoryRatings.highlight,
        notes: memoryRatings.notes,
      })
      .from(memoryRatings)
      .where(
        and(
          eq(memoryRatings.workspaceId, ctx.workspaceId),
          eq(memoryRatings.planId, planId),
        ),
      ),
  ]);

  const porPessoa = new Map(linhas.map((linha) => [linha.profileId, linha]));

  const members: MemberRating[] = membros.map((membro) => {
    const linha = porPessoa.get(membro.profileId);

    return {
      profileId: membro.profileId,
      displayName: membro.displayName,
      /* `smallint` volta como number, mas a escala é um literal: o CHECK do
         banco garante 1–5 e o guarda faz o tipo acompanhar sem `as`. */
      rating: isRatingValue(linha?.rating) ? linha.rating : null,
      wouldRepeat: isRepeatAnswer(linha?.wouldRepeat)
        ? linha.wouldRepeat
        : null,
      highlight: linha?.highlight ?? null,
      notes: linha?.notes ?? null,
    };
  });

  return {
    members,
    summary: summarizeRatings(members),
    mine: members.find((m) => m.profileId === ctx.profileId) ?? null,
  };
}

/**
 * Quantos dates já foram realizados. A Home e o estado vazio perguntam isso, e
 * carregar a timeline inteira para descobrir seria absurdo.
 */
export async function countMemories(ctx: AuthorizedContext): Promise<number> {
  const [linha] = await db
    .select({ total: count() })
    .from(plans)
    .innerJoin(planDateOptions, eq(planDateOptions.planId, plans.id))
    .where(
      and(
        eq(plans.workspaceId, ctx.workspaceId),
        eq(planDateOptions.workspaceId, ctx.workspaceId),
        eq(plans.status, "completed"),
        eq(planDateOptions.isConfirmed, true),
        isNull(plans.archivedAt),
      ),
    );

  return Number(linha?.total ?? 0);
}
