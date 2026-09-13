import "server-only";

import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import {
  media,
  memories,
  memoryRatings,
  planDateOptions,
  plans,
} from "@/db/schema/index.ts";
import { listWorkspaceMembers } from "@/features/dates/data/queries";
import { MEMORIES_PER_PAGE } from "@/features/memories/constants";
import { pageOffset } from "@/features/memories/timeline";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import {
  averageRatingTenths,
  type MemberRating,
  type RatingValue,
  type RepeatAnswer,
} from "@/lib/rating";

/**
 * Leituras das memórias. Contexto em primeiro lugar, `workspaceId` nunca é
 * parâmetro, todo `where` começa pelo predicado de workspace (D-037).
 *
 * A regra que manda neste arquivo:
 *
 * > O número de consultas é **constante** em relação ao número de planos.
 *
 * O seed tem oito planos, e com oito uma timeline que consulta por linha
 * responde igual a uma que consulta em bloco: nada fica vermelho na máquina de
 * ninguém. Um casal com dois anos de uso tem uns 150 dates realizados, o banco
 * é Neon serverless em `sa-east-1`, e cada consulta é uma ida e volta de 20 a
 * 50 ms — uma página de 24 memórias buscando capa, fotos e avaliação por linha
 * faz 72 viagens em vez de 4, e a tela leva três segundos.
 *
 * Por isso tudo aqui é `inArray` sobre os ids da página, e nunca um laço.
 */

export type MemoryCard = {
  planId: string;
  title: string;
  category: string | null;
  city: string | null;
  placeName: string | null;
  coverMediaId: string | null;
  /** Quando o date aconteceu: a data confirmada do B6, e nada copiado. */
  happenedAt: Date;
  allDay: boolean;
  photoCount: number;
  /** Décimos da média, e só quando as duas pessoas avaliaram. */
  averageTenths: number | null;
  ratingsGiven: number;
  memberCount: number;
};

export type MemoryPage = {
  items: MemoryCard[];
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

/**
 * Uma página da timeline, do mais recente para o mais antigo.
 *
 * Quatro consultas, sempre — com uma memória ou com sessenta:
 *
 * 1. os planos realizados da página, já com a data confirmada junto;
 * 2. os membros do workspace, que dizem quantas avaliações uma média exige;
 * 3. as avaliações desses planos, em bloco;
 * 4. quantas fotos de memória cada um tem, em bloco.
 *
 * As três últimas só acontecem quando a página tem alguma linha: numa página
 * vazia, `inArray` de lista vazia seria consulta jogada fora.
 *
 * O `innerJoin` com a opção confirmada é de propósito. A timeline é ordenada
 * por *quando aconteceu*, e um plano realizado sem data confirmada não teria
 * lugar nela — estado que a pré-condição de `completed` torna inalcançável.
 */
export async function listMemoryTimeline(
  ctx: AuthorizedContext,
  page: number,
): Promise<MemoryPage> {
  /* Uma linha a mais do que cabe na página: se ela vier, há próxima. Evita uma
     consulta de total só para desenhar um link — e o total não é mostrado. */
  const linhas = await db
    .select({
      planId: plans.id,
      title: plans.title,
      category: plans.category,
      city: plans.city,
      placeName: plans.placeName,
      coverMediaId: plans.coverMediaId,
      happenedAt: planDateOptions.startsAt,
      allDay: planDateOptions.allDay,
    })
    .from(plans)
    .innerJoin(
      planDateOptions,
      and(
        eq(planDateOptions.planId, plans.id),
        eq(planDateOptions.workspaceId, ctx.workspaceId),
        eq(planDateOptions.isConfirmed, true),
      ),
    )
    .where(
      and(
        eq(plans.workspaceId, ctx.workspaceId),
        eq(plans.status, "completed"),
        isNull(plans.archivedAt),
      ),
    )
    /* `plans.id` desempata: sem um segundo critério estável, dois dates no
       mesmo instante poderiam trocar de lugar entre uma página e outra, e a
       mesma memória apareceria duas vezes ou nenhuma. */
    .orderBy(desc(planDateOptions.startsAt), desc(plans.id))
    .limit(MEMORIES_PER_PAGE + 1)
    .offset(pageOffset(page, MEMORIES_PER_PAGE));

  const daPagina = linhas.slice(0, MEMORIES_PER_PAGE);
  const ids = daPagina.map((linha) => linha.planId);
  const hasNext = linhas.length > MEMORIES_PER_PAGE;

  if (ids.length === 0) {
    return { items: [], page, hasPrevious: page > 1, hasNext: false };
  }

  const [membros, avaliacoes, fotos] = await Promise.all([
    listWorkspaceMembers(ctx),
    db
      .select({
        planId: memories.planId,
        profileId: memoryRatings.profileId,
        rating: memoryRatings.rating,
      })
      .from(memoryRatings)
      .innerJoin(memories, eq(memories.id, memoryRatings.memoryId))
      .where(
        and(
          eq(memoryRatings.workspaceId, ctx.workspaceId),
          inArray(memories.planId, ids),
        ),
      ),
    db
      .select({ planId: media.planId, total: count() })
      .from(media)
      .where(
        and(
          eq(media.workspaceId, ctx.workspaceId),
          eq(media.purpose, "memory"),
          inArray(media.planId, ids),
        ),
      )
      .groupBy(media.planId),
  ]);

  /* Indexado por pessoa, não por posição: casar nota com membro pela ordem de
     chegada trocaria as duas avaliações entre si na hora em que a segunda
     pessoa avaliasse antes da primeira. */
  const porPlano = new Map<string, Map<string, number>>();
  for (const linha of avaliacoes) {
    const mapa = porPlano.get(linha.planId) ?? new Map<string, number>();
    mapa.set(linha.profileId, linha.rating);
    porPlano.set(linha.planId, mapa);
  }

  const fotosPorPlano = new Map<string, number>();
  for (const linha of fotos) {
    if (linha.planId !== null) {
      fotosPorPlano.set(linha.planId, Number(linha.total));
    }
  }

  return {
    items: daPagina.map((linha): MemoryCard => {
      const notas = porPlano.get(linha.planId);

      /* A lista é reconstruída no tamanho do workspace, com as ausências
         dentro. É isso que faz `averageRatingTenths` devolver `null` com
         metade do casal em silêncio — a mesma função e a mesma regra que a
         tela do plano usa (seção 4 do docs/MEMORIES.md). */
      const comAusencias: MemberRating[] = membros.map((membro) => ({
        profileId: membro.profileId,
        displayName: membro.displayName,
        rating: (notas?.get(membro.profileId) as RatingValue | undefined) ?? null,
        wouldRepeat: null,
      }));

      return {
        ...linha,
        photoCount: fotosPorPlano.get(linha.planId) ?? 0,
        averageTenths: averageRatingTenths(comAusencias),
        ratingsGiven: comAusencias.filter((item) => item.rating !== null)
          .length,
        memberCount: membros.length,
      };
    }),
    page,
    hasPrevious: page > 1,
    hasNext,
  };
}

export type MemoryRow = typeof memories.$inferSelect;

export type PlanMemory = {
  /** `null` enquanto ninguém avaliou nem escreveu nada sobre o date. */
  memory: MemoryRow | null;
  /** Sempre uma entrada por membro, na ordem estável do B6. */
  ratings: MemberRating[];
  averageTenths: number | null;
};

/**
 * A memória de um plano, com as duas avaliações — as duas **sempre** presentes.
 *
 * Membro sem linha entra com `rating: null`: ausência é "ainda não avaliou",
 * estado distinto de ter dado nota baixa (D-062), e é a interface que a escreve
 * como "Alex ainda não avaliou".
 *
 * Duas consultas quando não há memória, três quando há — nunca uma por pessoa.
 * As fotos e os gastos da mesma tela são lidos pelas camadas do B5 e do B8,
 * cada uma com a sua, e também nenhuma por linha.
 */
export async function getPlanMemory(
  ctx: AuthorizedContext,
  planId: string,
): Promise<PlanMemory> {
  const [membros, linhas] = await Promise.all([
    listWorkspaceMembers(ctx),
    db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.workspaceId, ctx.workspaceId),
          eq(memories.planId, planId),
        ),
      )
      .limit(1),
  ]);

  const memoria = linhas[0] ?? null;

  const notas = memoria
    ? await db
        .select({
          profileId: memoryRatings.profileId,
          rating: memoryRatings.rating,
          wouldRepeat: memoryRatings.wouldRepeat,
        })
        .from(memoryRatings)
        .where(
          and(
            eq(memoryRatings.workspaceId, ctx.workspaceId),
            eq(memoryRatings.memoryId, memoria.id),
          ),
        )
    : [];

  const porPessoa = new Map(notas.map((nota) => [nota.profileId, nota]));

  const ratings: MemberRating[] = membros.map((membro) => {
    const nota = porPessoa.get(membro.profileId);

    return {
      profileId: membro.profileId,
      displayName: membro.displayName,
      rating: (nota?.rating as RatingValue | undefined) ?? null,
      wouldRepeat: (nota?.wouldRepeat as RepeatAnswer | null) ?? null,
    };
  });

  return {
    memory: memoria,
    ratings,
    averageTenths: averageRatingTenths(ratings),
  };
}
